#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <string>
#include <vector>
#include <cstdio>

// Test-only negative control, never copied into worker/dist. This is deliberately
// NOT a sandbox: removing privileges without restricting ordinary user SIDs
// still permits that user's ordinary file access and loopback network access.
struct Handle {
  HANDLE value = nullptr;
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
};
static bool ReducedToken(HANDLE token) {
  DWORD restricted = 0, size = 0;
  if (!GetTokenInformation(token, TokenHasRestrictions, &restricted, sizeof(restricted), &size) || !restricted) return false;
  GetTokenInformation(token, TokenPrivileges, nullptr, 0, &size);
  std::vector<BYTE> storage(size);
  if (!GetTokenInformation(token, TokenPrivileges, storage.data(), size, &size)) return false;
  LUID notify{};
  if (!LookupPrivilegeValueW(nullptr, L"SeChangeNotifyPrivilege", &notify)) return false;
  const auto privileges = reinterpret_cast<TOKEN_PRIVILEGES*>(storage.data());
  for (DWORD i = 0; i < privileges->PrivilegeCount; ++i) {
    const auto luid = privileges->Privileges[i].Luid;
    if (luid.LowPart != notify.LowPart || luid.HighPart != notify.HighPart) return false;
  }
  return true;
}
static DWORD Read(const wchar_t* path) {
  Handle file; file.value = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ,
    nullptr, OPEN_EXISTING, 0, nullptr);
  if (file.value == INVALID_HANDLE_VALUE) return GetLastError();
  char data[64]{}; DWORD size = 0;
  if (!ReadFile(file.value, data, sizeof(data), &size, nullptr)) return GetLastError();
  const std::string content(data, size);
  return content == "approved sentinel" || content == "synthetic outside sentinel" ? 0 : ERROR_INVALID_DATA;
}
static DWORD Child(const wchar_t* mode, DWORD flags) {
  wchar_t image[32768]{};
  if (!GetModuleFileNameW(nullptr, image, 32768)) return GetLastError();
  std::wstring command = L"\"" + std::wstring(image) + L"\" --probe " + mode + L" 0";
  STARTUPINFOW startup{}; startup.cb = sizeof(startup);
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(image, command.data(), nullptr, nullptr, FALSE,
      CREATE_NO_WINDOW | flags, nullptr, nullptr, &startup, &process)) return GetLastError();
  Handle child{process.hProcess}, thread{process.hThread};
  if (WaitForSingleObject(child.value, 2000) != WAIT_OBJECT_0) {
    TerminateProcess(child.value, ERROR_TIMEOUT);
    WaitForSingleObject(child.value, 2000);
    return ERROR_TIMEOUT;
  }
  DWORD code = 0;
  if (!GetExitCodeProcess(child.value, &code)) return GetLastError();
  return (code & 0xffff0000) == 0x10000 ? code & 0xffff : ERROR_PROCESS_ABORTED;
}
static DWORD Loopback(unsigned short port) {
  if (!port) return ERROR_INVALID_PARAMETER;
  WSADATA data{};
  int error = WSAStartup(MAKEWORD(2, 2), &data);
  if (error) return error;
  SOCKET socket = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (socket == INVALID_SOCKET) { error = WSAGetLastError(); WSACleanup(); return error; }
  u_long nonblocking = 1;
  if (ioctlsocket(socket, FIONBIO, &nonblocking)) error = WSAGetLastError();
  else {
    sockaddr_in address{}; address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // Fixed 127.0.0.1, no DNS.
    address.sin_port = htons(port);
    if (connect(socket, reinterpret_cast<sockaddr*>(&address), sizeof(address))) {
      error = WSAGetLastError();
      if (error == WSAEWOULDBLOCK) {
        fd_set write, fail; FD_ZERO(&write); FD_ZERO(&fail);
        FD_SET(socket, &write); FD_SET(socket, &fail);
        timeval timeout{2, 0};
        int ready = select(0, nullptr, &write, &fail, &timeout);
        if (ready > 0) {
          int size = sizeof(error);
          if (getsockopt(socket, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&error), &size)) error = WSAGetLastError();
        } else error = ready == 0 ? WSAETIMEDOUT : WSAGetLastError();
      }
    }
  }
  closesocket(socket); WSACleanup(); return error;
}
static DWORD Probe(const std::wstring& scenario, unsigned short port) {
  // Every operation targets a synthetic fixture, never a configurable file.
  if (scenario == L"approved-read") return Read(L"approved.txt");
  if (scenario == L"outside-read") {
    wchar_t absolute[32768]{};
    if (!GetFullPathNameW(L"..\\outside\\secret.txt", 32768, absolute, nullptr)) return GetLastError();
    return Read(absolute);
  }
  if (scenario == L"traversal-read") return Read(L"..\\outside\\secret.txt");
  if (scenario == L"junction-read") return Read(L"junction\\secret.txt");
  if (scenario == L"child-read") return Child(L"outside-read", 0);
  if (scenario == L"breakaway") return Child(L"approved-read", CREATE_BREAKAWAY_FROM_JOB);
  if (scenario == L"loopback") return Loopback(port);
  if (scenario == L"write") {
    Handle file; file.value = CreateFileW(L"approved.txt", GENERIC_WRITE,
      FILE_SHARE_READ, nullptr, TRUNCATE_EXISTING, 0, nullptr);
    if (file.value == INVALID_HANDLE_VALUE) return GetLastError();
    DWORD size = 0;
    if (!WriteFile(file.value, "changed", 7, &size, nullptr)) return GetLastError();
    return size == 7 ? 0 : ERROR_WRITE_FAULT;
  }
  if (scenario == L"delete") return DeleteFileW(L"approved.txt") ? 0 : GetLastError();
  if (scenario == L"rename") return MoveFileExW(L"approved.txt", L"approved.txt.renamed", 0) ? 0 : GetLastError();
  if (scenario == L"replace") return ReplaceFileW(L"approved.txt", L"replacement.txt", nullptr, 0, nullptr, nullptr) ? 0 : GetLastError();
  return ERROR_INVALID_PARAMETER;
}
int wmain(int argc, wchar_t** argv) {
  // No arbitrary command, executable, host or file path accepted by this helper.
  if (argc == 4 && std::wstring(argv[1]) == L"--probe") {
    Handle token;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token.value) || !ReducedToken(token.value)) return 60001;
    BOOL member = FALSE;
    if (!IsProcessInJob(GetCurrentProcess(), nullptr, &member) || !member) return 60002;
    return static_cast<int>(0x10000 | Probe(argv[2], static_cast<unsigned short>(_wtoi(argv[3]))));
  }
  if (argc != 3) return 2;
  const std::wstring scenario(argv[1]);
  const std::vector<std::wstring> scenarios = {L"approved-read", L"outside-read", L"traversal-read", L"junction-read", L"write", L"delete", L"rename", L"replace", L"child-read", L"breakaway", L"loopback"};
  bool known = false;
  for (const auto& name : scenarios) if (scenario == name) known = true;
  if (!known) return 2;
  std::wstring portText(argv[2]);
  if (portText.empty() || portText.size() > 5 || portText.find_first_not_of(L"0123456789") != std::wstring::npos || _wtoi(argv[2]) > 65535) return 2;
  // Reject accidental invocation in a real workspace before creating any child.
  wchar_t cwd[32768]{};
  if (!GetCurrentDirectoryW(32768, cwd)) return 3;
  std::wstring directory(cwd);
  const auto slash = directory.find_last_of(L'\\');
  if (slash == std::wstring::npos || directory.substr(slash) != L"\\workspace" ||
      directory.substr(0, slash).find(L"\\ak-sandbox-") == std::wstring::npos) return 4;
  if (Read(L"approved.txt") || Read(L"..\\outside\\secret.txt")) return 5;
  Handle token, restricted, job;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY, &token.value)) return 6;
  if (!CreateRestrictedToken(token.value, DISABLE_MAX_PRIVILEGE, 0, nullptr, 0, nullptr, 0, nullptr, &restricted.value)) return 8;
  job.value = CreateJobObjectW(nullptr, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS | JOB_OBJECT_LIMIT_JOB_MEMORY;
  limits.BasicLimitInformation.ActiveProcessLimit = 3;
  limits.JobMemoryLimit = 128 * 1024 * 1024;
  if (!job.value || !SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return 9;
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
  std::vector<BYTE> storage(size);
  auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  if (!InitializeProcThreadAttributeList(attributes, 1, 0, &size)) return 10;
  if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job.value, sizeof(HANDLE), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(attributes); return 11;
  }
  wchar_t image[32768]{};
  if (!GetModuleFileNameW(nullptr, image, 32768)) { DeleteProcThreadAttributeList(attributes); return 12; }
  std::wstring command = L"\"" + std::wstring(image) + L"\" --probe " + argv[1] + L" " + argv[2];
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup); startup.lpAttributeList = attributes;
  PROCESS_INFORMATION process{};
  BOOL created = CreateProcessAsUserW(restricted.value, image, command.data(), nullptr, nullptr, FALSE,
    CREATE_NO_WINDOW | CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT, nullptr, cwd, &startup.StartupInfo, &process);
  DWORD createError = created ? 0 : GetLastError();
  DeleteProcThreadAttributeList(attributes);
  if (!created) { std::fprintf(stderr, "CreateProcessAsUserW:%lu\n", createError); return 13; }
  Handle child{process.hProcess}, thread{process.hThread}, childToken;
  BOOL member = FALSE;
  bool verified = IsProcessInJob(child.value, job.value, &member) && member &&
    OpenProcessToken(child.value, TOKEN_QUERY, &childToken.value) && ReducedToken(childToken.value);
  DWORD code = 60003;
  if (verified && ResumeThread(thread.value) == 1 && WaitForSingleObject(child.value, 5000) == WAIT_OBJECT_0)
    GetExitCodeProcess(child.value, &code);
  bool cleaned = TerminateJobObject(job.value, 137) != FALSE;
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  const ULONGLONG deadline = GetTickCount64() + 2000;
  do {
    if (!QueryInformationJobObject(job.value, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr)) { cleaned = false; break; }
    if (!accounting.ActiveProcesses) break;
    Sleep(10);
  } while (GetTickCount64() < deadline);
  cleaned = cleaned && accounting.ActiveProcesses == 0;
  const bool reported = (code & 0xffff0000) == 0x10000;
  if (!reported) { std::fprintf(stderr, "Probe did not report an operation result:0x%08lx\n", code); return 15; }
  std::printf("{\"tokenRestricted\":%s,\"jobMember\":%s,\"cleaned\":%s,\"error\":%lu}\n",
    verified ? "true" : "false", member ? "true" : "false", cleaned ? "true" : "false", code & 0xffff);
  return verified && cleaned ? 0 : 14;
}
