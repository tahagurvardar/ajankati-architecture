#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <shlobj.h>
#include <sddl.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <memory>
#include <algorithm>
#include <atomic>

// Deliberately separate from ConPTY. No PID-based termination, shell or argv API.
struct Handle {
  HANDLE h = nullptr;
  Handle() = default;
  explicit Handle(HANDLE value): h(value == INVALID_HANDLE_VALUE ? nullptr : value) {}
  ~Handle() { reset(); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  bool reset(HANDLE value = nullptr) {
    if (h && !CloseHandle(h)) return false;
    h = value == INVALID_HANDLE_VALUE ? nullptr : value; return true;
  }
};
struct Owner {
  Handle job, process, input, output, error, image;
  std::vector<std::unique_ptr<Handle>> directories;
  DWORD pid = 0;
  bool verified = false, closed = false, stdoutClosed = false, stderrClosed = false;
#ifdef AJANKATI_TEST
  bool cleanupFailure = false;
  std::wstring testStage, testCheckpoint;
  Handle sentinel;
#endif
};
static std::atomic<bool> occupied{false};
static std::atomic<bool> poisoned{false};
static bool ProfilePolicyAbsent() {
  // Preserve managed security controls: refuse the probe if any are configured.
  HKEY key{};
  LSTATUS status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Policies\\OpenAI\\Codex", 0,
                                KEY_READ | KEY_WOW64_64KEY, &key);
  if (status == ERROR_SUCCESS) { RegCloseKey(key); return false; }
  if (status != ERROR_FILE_NOT_FOUND) return false;
  PWSTR path = nullptr;
  if (FAILED(SHGetKnownFolderPath(FOLDERID_ProgramData, 0, nullptr, &path))) return false;
  std::wstring directory = std::wstring(path) + L"\\OpenAI\\Codex";
  CoTaskMemFree(path);
  if (GetFileAttributesW(directory.c_str()) != INVALID_FILE_ATTRIBUTES) return false;
  DWORD error = GetLastError();
  return error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND;
}
static napi_value Fail(napi_env env, const char* code) {
  std::string message = std::string(code) + " (Win32=" + std::to_string(GetLastError()) + ")";
  napi_throw_error(env, code, message.c_str()); return nullptr;
}
static std::wstring String(napi_env env, napi_value value) {
  size_t size = 0;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &size) != napi_ok || size > 32000) return L"";
  std::vector<char16_t> data(size + 1);
  napi_get_value_string_utf16(env, value, data.data(), data.size(), &size);
  std::wstring result(reinterpret_cast<wchar_t*>(data.data()), size);
  if (result.find(L'\0') != std::wstring::npos) return L"";
  return result;
}
static DWORD Active(Owner* owner) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
  if (!owner->job.h || !QueryInformationJobObject(owner->job.h, JobObjectBasicAccountingInformation,
      &info, sizeof(info), nullptr)) return MAXDWORD;
  return info.ActiveProcesses;
}
static std::vector<DWORD> Members(Owner* owner) {
  alignas(JOBOBJECT_BASIC_PROCESS_ID_LIST) BYTE buffer[sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + 128 * sizeof(ULONG_PTR)]{};
  auto list = reinterpret_cast<JOBOBJECT_BASIC_PROCESS_ID_LIST*>(buffer);
  if (!owner->job.h || !QueryInformationJobObject(owner->job.h, JobObjectBasicProcessIdList, list, sizeof(buffer), nullptr)) return {};
  std::vector<DWORD> result;
  for (DWORD i = 0; i < list->NumberOfProcessIdsInList; ++i) result.push_back(static_cast<DWORD>(list->ProcessIdList[i]));
  return result; // Diagnostic evidence only; never termination authority.
}
static bool Stop(Owner* owner) {
  if (owner->closed) return false;
#ifdef AJANKATI_TEST
  if (owner->cleanupFailure) return false;
#endif
  if (!TerminateJobObject(owner->job.h, 137)) return false;
  for (int i = 0; i < 400; ++i) {
    if (Active(owner) == 0) return true;
    Sleep(5);
  }
  return false;
}
static bool Dispose(Owner* owner) {
  bool success = true;
  if (!owner->closed) {
    success = Stop(owner);
    success &= owner->job.reset(); // Last-handle fallback; never claim this proves zero.
    success &= owner->process.reset(); success &= owner->input.reset();
    success &= owner->output.reset(); success &= owner->error.reset();
    success &= owner->image.reset();
#ifdef AJANKATI_TEST
    success &= owner->sentinel.reset();
#endif
    for (auto& directory : owner->directories) success &= directory->reset();
    owner->directories.clear();
    if (!success) poisoned = true;
    owner->closed = true; occupied = false;
  }
  return success;
}
static void Finalize(napi_env, void* data, void*) { auto owner = static_cast<Owner*>(data); Dispose(owner); delete owner; }
static Owner* Get(napi_env env, napi_value value) {
  void* data = nullptr;
  if (napi_get_value_external(env, value, &data) != napi_ok || !data) { Fail(env, "INVALID_OWNER"); return nullptr; }
  return static_cast<Owner*>(data);
}
static std::wstring Directory() {
  HMODULE module{};
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
      reinterpret_cast<LPCWSTR>(&Directory), &module)) return L"";
  wchar_t path[32768]{};
  DWORD size = GetModuleFileNameW(module, path, 32768);
  if (!size || size >= 32768) return L"";
  std::wstring result(path);
  // Node loads addons with an extended-length DOS prefix; UNC remains rejected.
  if (result.rfind(L"\\\\?\\", 0) == 0 && result.size() > 6 && result[5] == L':') result.erase(0, 4);
  return result.substr(0, result.find_last_of(L'\\'));
}
static const char* identityError = "IDENTITY_REJECTED";
static bool VerifyImage(Owner* owner, const std::wstring& path, bool reject) {
  identityError = "IDENTITY_PATH";
  // Reject reparse components, keep every ancestor open without DELETE sharing.
  // The image itself has neither WRITE nor DELETE sharing through process creation.
  if (path.size() < 4 || path[1] != L':' || path[2] != L'\\') return false;
  for (size_t end = 3; end != std::wstring::npos; end = path.find(L'\\', end + 1)) {
    auto directory = std::make_unique<Handle>(CreateFileW(path.substr(0, end).c_str(), FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ, nullptr, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
    BY_HANDLE_FILE_INFORMATION info{};
    if (!directory->h) { identityError = "IDENTITY_DIRECTORY_OPEN"; return false; }
    if (!GetFileInformationByHandle(directory->h, &info)) { identityError = "IDENTITY_DIRECTORY_INFO"; return false; }
    if (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) { identityError = "IDENTITY_REPARSE"; return false; }
    owner->directories.push_back(std::move(directory));
  }
  owner->image.reset(CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr,
                                OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (owner->image.h == INVALID_HANDLE_VALUE) owner->image.h = nullptr;
  BY_HANDLE_FILE_INFORMATION info{};
  identityError = "IDENTITY_FILE";
  if (!owner->image.h || !GetFileInformationByHandle(owner->image.h, &info) ||
      (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) return false;
  BCRYPT_ALG_HANDLE algorithm{}; BCRYPT_HASH_HANDLE hash{};
  identityError = "IDENTITY_HASH";
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0)) return false;
  bool ok = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) == 0;
  BYTE buffer[65536], digest[32]; DWORD count;
  while (ok) {
    if (!ReadFile(owner->image.h, buffer, sizeof(buffer), &count, nullptr)) { ok = false; break; }
    if (!count) break;
    ok = BCryptHashData(hash, buffer, count, 0) == 0;
  }
  if (ok) ok = BCryptFinishHash(hash, digest, sizeof(digest), 0) == 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (!ok) return false;
  identityError = "IDENTITY_REJECTED";
  if (reject) return false;
#ifndef AJANKATI_TEST
  const char* expected = "6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36";
  const char* hex = "0123456789abcdef";
  for (int i = 0; i < 32; ++i)
    if (hex[digest[i] >> 4] != expected[i*2] || hex[digest[i] & 15] != expected[i*2+1]) return false;
#endif
  return true;
}
static bool InputPipe(Handle& parent, Handle& child) {
  // Overlapped parent writes have a finite deadline even if the child never reads.
  BYTE random[16];
  if (BCryptGenRandom(nullptr, random, sizeof(random), BCRYPT_USE_SYSTEM_PREFERRED_RNG)) return false;
  std::wstring name = L"\\\\.\\pipe\\AjanKati-stdio-";
  for (BYTE value : random) { name += L"0123456789abcdef"[value >> 4]; name += L"0123456789abcdef"[value & 15]; }
  Handle token;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.h)) return false;
  DWORD size = 0; GetTokenInformation(token.h, TokenUser, nullptr, 0, &size);
  std::vector<BYTE> user(size);
  if (!GetTokenInformation(token.h, TokenUser, user.data(), size, &size)) return false;
  LPWSTR sid = nullptr;
  if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(user.data())->User.Sid, &sid)) return false;
  std::wstring sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;" + std::wstring(sid) + L")";
  LocalFree(sid);
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) return false;
  SECURITY_ATTRIBUTES pipeSecurity{sizeof(pipeSecurity), descriptor, FALSE};
  parent.reset(CreateNamedPipeW(name.c_str(), PIPE_ACCESS_OUTBOUND | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
      PIPE_TYPE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1, 65536, 65536, 0, &pipeSecurity));
  LocalFree(descriptor);
  if (!parent.h) return false;
  SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
  child.reset(CreateFileW(name.c_str(), GENERIC_READ, 0, &security, OPEN_EXISTING, 0, nullptr));
  if (!child.h) return false;
  return true;
}
#ifdef AJANKATI_TEST
static void Checkpoint(const std::wstring& wanted, const wchar_t* stage, const std::wstring& path, Owner* owner) {
  if (wanted != stage) return;
  if (wanted == L"resumed") {
    for (int i = 0; i < 200 && Active(owner) < 6; ++i) Sleep(5);
  }
  Handle file(CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_NEW, 0, nullptr));
  std::string output = "[";
  for (DWORD pid : Members(owner)) { if (output.size() > 1) output += ","; output += std::to_string(pid); }
  output += "]"; DWORD written;
  if (file.h) { WriteFile(file.h, output.data(), static_cast<DWORD>(output.size()), &written, nullptr); file.reset(); }
  Sleep(30000); // Parent kills this owned test worker; absent in production.
}
#else
static void Checkpoint(const std::wstring&, const wchar_t*, const std::wstring&, Owner*) {}
#endif
static napi_value Open(napi_env env, napi_callback_info info) {
  ULONGLONG launchDeadline = GetTickCount64() + 5000;
  size_t count = 3; napi_value args[3];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count < 1) return Fail(env, "INVALID_PROFILE");
  auto profile = String(env, args[0]);
  if (profile.size() < 3 || profile[1] != L':' || profile[2] != L'\\') return Fail(env, "INVALID_PROFILE");
  std::wstring stage, checkpoint;
#ifdef AJANKATI_TEST
  if (count > 1) stage = String(env, args[1]);
  if (count > 2) checkpoint = String(env, args[2]);
#else
  if (count != 1) return Fail(env, "INVALID_PROFILE");
  if (!ProfilePolicyAbsent()) return Fail(env, "MANAGED_CONFIG_REVIEW_REQUIRED");
#endif
  if (poisoned || occupied.exchange(true)) return Fail(env, "OWNER_BUSY_OR_POISONED");
  auto owner = std::make_unique<Owner>();
#ifdef AJANKATI_TEST
  owner->cleanupFailure = stage == L"cleanup-failure";
  owner->testStage = stage; owner->testCheckpoint = checkpoint;
#endif
  auto failure = [&](const char* code) -> napi_value {
    if (owner->process.h && !Stop(owner.get())) { poisoned = true; code = "CLEANUP_UNCONFIRMED"; }
    DWORD error = GetLastError(); owner.reset(); occupied = false; SetLastError(error); return Fail(env, code);
  };
  auto image = Directory() +
#ifdef AJANKATI_TEST
    L"\\stdio_fixture.exe";
#else
    L"\\codex.exe";
#endif
  if (!VerifyImage(owner.get(), image, stage == L"identity")) return failure(identityError);
  Checkpoint(stage, L"before-job", checkpoint, owner.get());
  owner->job.reset(CreateJobObjectW(nullptr, nullptr));
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
#ifdef AJANKATI_TEST
  if (stage == L"deny-create") { limits.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS; limits.BasicLimitInformation.ActiveProcessLimit = 0; }
#endif
  if (!owner->job.h || !SetInformationJobObject(owner->job.h, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return failure("JOB_SETUP_FAILED");
  Checkpoint(stage, L"after-job", checkpoint, owner.get());
  Handle childIn, childOut, childErr;
  if (!InputPipe(owner->input, childIn)) return failure("PIPE_SETUP_FAILED");
  SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
  if (!CreatePipe(&owner->output.h, &childOut.h, &security, 65536) ||
      !CreatePipe(&owner->error.h, &childErr.h, &security, 65536) ||
      !SetHandleInformation(owner->output.h, HANDLE_FLAG_INHERIT, 0) ||
      !SetHandleInformation(owner->error.h, HANDLE_FLAG_INHERIT, 0)) return failure("PIPE_SETUP_FAILED");
  SIZE_T bytes = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &bytes);
  std::vector<BYTE> storage(bytes);
  auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  if (!InitializeProcThreadAttributeList(attributes, 2, 0, &bytes)) return failure("ATTRIBUTES_FAILED");
  HANDLE inherited[] = {childIn.h, childOut.h, childErr.h};
  bool attributesOk = UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &owner->job.h, sizeof(HANDLE), nullptr, nullptr) &&
      UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited), nullptr, nullptr);
  if (!attributesOk) { DeleteProcThreadAttributeList(attributes); return failure("ATTRIBUTES_FAILED"); }
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = childIn.h; startup.StartupInfo.hStdOutput = childOut.h; startup.StartupInfo.hStdError = childErr.h;
  startup.lpAttributeList = attributes;
  std::wstring command = L"\"" + image + L"\"";
#ifdef AJANKATI_TEST
  owner->sentinel.reset(CreateEventW(&security, TRUE, FALSE, nullptr));
  command += L" 0 " + std::to_wstring(reinterpret_cast<ULONG_PTR>(owner->sentinel.h));
#endif
#ifndef AJANKATI_TEST
  command += L" app-server --listen stdio://";
#endif
  // No inherited credentials, PATH, NODE_OPTIONS, plugin or proxy variables.
  wchar_t system[32768]{}; UINT systemSize = GetWindowsDirectoryW(system, 32768);
  if (!systemSize || systemSize >= 32768) { DeleteProcThreadAttributeList(attributes); return failure("ENVIRONMENT_FAILED"); }
  std::vector<std::wstring> entries = {L"CODEX_HOME=" + profile, L"HOME=" + profile,
    L"LOCALAPPDATA=" + profile, L"APPDATA=" + profile, L"SystemRoot=" + std::wstring(system),
    L"TEMP=" + profile, L"TMP=" + profile, L"USERPROFILE=" + profile};
  std::sort(entries.begin(), entries.end());
  std::vector<wchar_t> environment;
  for (const auto& entry: entries) { environment.insert(environment.end(), entry.begin(), entry.end()); environment.push_back(0); }
  environment.push_back(0);
  PROCESS_INFORMATION process{};
  Checkpoint(stage, L"before-create", checkpoint, owner.get());
#ifdef AJANKATI_TEST
  if (stage == L"launch-timeout") launchDeadline = 0;
#endif
  if (GetTickCount64() >= launchDeadline) {
    DeleteProcThreadAttributeList(attributes); return failure("LAUNCH_TIMEOUT");
  }
  BOOL created = CreateProcessW(image.c_str(), command.data(), nullptr, nullptr, TRUE,
      EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
      environment.data(), profile.c_str(), &startup.StartupInfo, &process);
  DeleteProcThreadAttributeList(attributes);
  if (!created) return failure("CREATE_FAILED");
  owner->process.reset(process.hProcess); Handle thread(process.hThread); owner->pid = process.dwProcessId;
  childIn.reset(); childOut.reset(); childErr.reset();
  Checkpoint(stage, L"created", checkpoint, owner.get());
  BOOL member = FALSE;
  if (!IsProcessInJob(owner->process.h, owner->job.h, &member) || !member) {
    // Only our returned creation handle; never an enumerated PID.
    if (!TerminateProcess(owner->process.h, 137) || WaitForSingleObject(owner->process.h, 2000) != WAIT_OBJECT_0) {
      poisoned = true; return failure("CLEANUP_UNCONFIRMED");
    }
    return failure("MEMBERSHIP_FAILED");
  }
  owner->verified = true;
  Checkpoint(stage, L"verified", checkpoint, owner.get());
#ifdef AJANKATI_TEST
  if (stage == L"resume-timeout") launchDeadline = 0;
#endif
  // A delayed native call must not resume a target after the outer watchdog gave up.
  if (GetTickCount64() >= launchDeadline) return failure("LAUNCH_TIMEOUT");
  if (ResumeThread(thread.h) != 1) return failure("RESUME_FAILED");
  Checkpoint(stage, L"resumed", checkpoint, owner.get());
  napi_value result;
  if (napi_create_external(env, owner.get(), Finalize, nullptr, &result) != napi_ok) return failure("OWNER_FAILED");
  owner.release(); return result;
}
static napi_value Snapshot(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  auto owner = count ? Get(env, arg) : nullptr; if (!owner) return nullptr;
  if (owner->closed) return Fail(env, "OWNER_CLOSED");
  DWORD active = Active(owner); if (active == MAXDWORD) return Fail(env, "ACCOUNTING_FAILED");
  napi_value result, value; napi_create_object(env, &result);
#ifdef AJANKATI_TEST
  napi_get_boolean(env, WaitForSingleObject(owner->sentinel.h, 0) == WAIT_OBJECT_0, &value);
  napi_set_named_property(env, result, "unexpectedHandleInherited", value);
#endif
  napi_value members; napi_create_array(env, &members); uint32_t index = 0;
  for (DWORD pid : Members(owner)) { napi_create_uint32(env, pid, &value); napi_set_element(env, members, index++, value); }
  napi_set_named_property(env, result, "members", members);
  napi_create_uint32(env, active, &value); napi_set_named_property(env, result, "active", value);
  napi_create_uint32(env, owner->pid, &value); napi_set_named_property(env, result, "pid", value);
  napi_get_boolean(env, owner->verified, &value); napi_set_named_property(env, result, "verified", value);
  bool exited = WaitForSingleObject(owner->process.h, 0) == WAIT_OBJECT_0;
  napi_get_boolean(env, exited, &value); napi_set_named_property(env, result, "exited", value);
  DWORD exitCode = 0;
  if (exited && GetExitCodeProcess(owner->process.h, &exitCode)) napi_create_uint32(env, exitCode, &value);
  else napi_get_null(env, &value);
  napi_set_named_property(env, result, "exitCode", value);
  napi_get_boolean(env, owner->stdoutClosed, &value); napi_set_named_property(env, result, "stdoutClosed", value);
  napi_get_boolean(env, owner->stderrClosed, &value); napi_set_named_property(env, result, "stderrClosed", value);
  DWORD handles = 0; GetProcessHandleCount(GetCurrentProcess(), &handles);
  napi_create_uint32(env, handles, &value); napi_set_named_property(env, result, "handles", value);
  return result;
}
static napi_value Read(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 2) return Fail(env, "INVALID_READ");
  auto owner = Get(env, args[0]); if (!owner) return nullptr;
  if (owner->closed) return Fail(env, "OWNER_CLOSED");
  bool error = false; napi_get_value_bool(env, args[1], &error);
  HANDLE pipe = error ? owner->error.h : owner->output.h;
  DWORD available = 0, countRead = 0; BYTE buffer[16384];
  if (!PeekNamedPipe(pipe, nullptr, 0, nullptr, &available, nullptr)) {
    if (GetLastError() != ERROR_BROKEN_PIPE) return Fail(env, "PIPE_READ_FAILED");
    (error ? owner->stderrClosed : owner->stdoutClosed) = true;
  } else if (available && !ReadFile(pipe, buffer, std::min<DWORD>(available, sizeof(buffer)), &countRead, nullptr)) return Fail(env, "PIPE_READ_FAILED");
  napi_value result; napi_create_buffer_copy(env, countRead, buffer, nullptr, &result); return result;
}
static napi_value Write(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 2) return Fail(env, "INVALID_WRITE");
  auto owner = Get(env, args[0]); if (!owner) return nullptr;
  if (owner->closed) return Fail(env, "OWNER_CLOSED");
  void* data; size_t size;
  if (napi_get_buffer_info(env, args[1], &data, &size) != napi_ok || size == 0 || size > 65536) return Fail(env, "WRITE_LIMIT");
  Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr)); if (!event.h) return Fail(env, "PIPE_WRITE_FAILED");
  OVERLAPPED operation{}; operation.hEvent = event.h; DWORD written = 0;
  BOOL ok = WriteFile(owner->input.h, data, static_cast<DWORD>(size), &written, &operation);
  if (!ok && GetLastError() == ERROR_IO_PENDING) {
#ifdef AJANKATI_TEST
    Checkpoint(owner->testStage, L"pending-write", owner->testCheckpoint, owner);
#endif
    if (WaitForSingleObject(event.h, 1000) != WAIT_OBJECT_0) {
      CancelIoEx(owner->input.h, &operation);
      GetOverlappedResult(owner->input.h, &operation, &written, TRUE); // Drain cancellation before stack/buffer release.
      return Fail(env, "WRITE_TIMEOUT");
    }
    ok = GetOverlappedResult(owner->input.h, &operation, &written, FALSE);
  }
  if (!ok || written != size) return Fail(env, "PIPE_WRITE_FAILED");
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value StopExport(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  auto owner = count ? Get(env, arg) : nullptr; if (!owner) return nullptr;
  bool success = Stop(owner); if (!success) poisoned = true;
  napi_value result; napi_get_boolean(env, success, &result); return result;
}
static napi_value Close(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value arg; napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
  auto owner = count ? Get(env, arg) : nullptr; if (!owner) return nullptr;
  if (!Dispose(owner)) return Fail(env, "CLEANUP_UNCONFIRMED");
  napi_value result; napi_get_undefined(env, &result); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
    {"open", nullptr, Open, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"snapshot", nullptr, Snapshot, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"read", nullptr, Read, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"write", nullptr, Write, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, StopExport, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 6, methods); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
