#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <node_api.h>
#include <string>
#include <vector>

// Only the worker owns this non-inheritable handle. No PID termination API.
struct Job { HANDLE handle; };
static napi_value Fail(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}
static void Finalize(napi_env, void* data, void*) {
  auto job = static_cast<Job*>(data);
  if (job->handle) CloseHandle(job->handle);
  delete job;
}
static Job* Get(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value arg;
  void* data = nullptr;
  if (napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr) != napi_ok ||
      count != 1 || napi_get_value_external(env, arg, &data) != napi_ok) {
    Fail(env, "Invalid job owner");
    return nullptr;
  }
  return static_cast<Job*>(data);
}
static napi_value Create(napi_env env, napi_callback_info info) {
#ifdef AJANKATI_TEST
  size_t supplied = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &supplied, args, nullptr, nullptr);
#endif
  size_t count = 1, length = 0;
  napi_value arg;
  napi_get_cb_info(env, info, &count, &arg, nullptr, nullptr);
#ifdef AJANKATI_TEST
  if (count == 2) count = 1;
#endif
  if (count != 1 || napi_get_value_string_utf16(env, arg, nullptr, 0, &length) != napi_ok || length > 100)
    return Fail(env, "Invalid job name");
  std::vector<char16_t> name(length + 1);
  napi_get_value_string_utf16(env, arg, name.data(), name.size(), &length);
  HANDLE handle = CreateJobObjectW(nullptr, reinterpret_cast<LPCWSTR>(name.data()));
  if (!handle) return Fail(env, "CreateJobObject failed");
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    CloseHandle(handle);
    return Fail(env, "Job name already exists");
  }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
#ifdef AJANKATI_TEST
  // Only the separate test addon exposes a restrictive limit. It exercises real
  // Windows association/creation errors; production has no fault switches.
  if (supplied == 2) {
    uint32_t limit = 0;
    if (napi_get_value_uint32(env, args[1], &limit) != napi_ok) {
      CloseHandle(handle);
      return Fail(env, "Invalid test limit");
    }
    limits.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
    limits.BasicLimitInformation.ActiveProcessLimit = limit;
  }
#endif
  if (!SetInformationJobObject(handle, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    CloseHandle(handle);
    return Fail(env, "SetInformationJobObject failed");
  }
  auto job = new Job{handle};
  napi_value result;
  if (napi_create_external(env, job, Finalize, nullptr, &result) != napi_ok) {
    Finalize(env, job, nullptr);
    return Fail(env, "Cannot retain job owner");
  }
  return result;
}
static napi_value Active(napi_env env, napi_callback_info info) {
  auto job = Get(env, info);
  if (!job) return nullptr;
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  if (!job->handle || !QueryInformationJobObject(job->handle, JobObjectBasicAccountingInformation,
       &accounting, sizeof(accounting), nullptr)) return Fail(env, "Job accounting failed");
  napi_value result;
  napi_create_uint32(env, accounting.ActiveProcesses, &result);
  return result;
}
static napi_value Terminate(napi_env env, napi_callback_info info) {
  auto job = Get(env, info);
  if (!job) return nullptr;
  if (!job->handle || !TerminateJobObject(job->handle, 137)) return Fail(env, "TerminateJobObject failed");
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value Members(napi_env env, napi_callback_info info) {
  auto job = Get(env, info);
  if (!job) return nullptr;
  // Bounded diagnostic evidence only; these PIDs are NEVER termination authority.
  alignas(JOBOBJECT_BASIC_PROCESS_ID_LIST) BYTE buffer[sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) + 128 * sizeof(ULONG_PTR)]{};
  auto list = reinterpret_cast<JOBOBJECT_BASIC_PROCESS_ID_LIST*>(buffer);
  if (!job->handle || !QueryInformationJobObject(job->handle, JobObjectBasicProcessIdList, list, sizeof(buffer), nullptr))
    return Fail(env, "Job member enumeration failed");
  napi_value result;
  napi_create_array(env, &result);
  for (DWORD i = 0; i < list->NumberOfProcessIdsInList; ++i) {
    DWORD pid = static_cast<DWORD>(list->ProcessIdList[i]);
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    wchar_t path[32768]{};
    DWORD length = 32768;
    if (process) {
      if (!QueryFullProcessImageNameW(process, 0, path, &length)) length = 0;
      CloseHandle(process);
    } else length = 0;
    napi_value item, id, image;
    napi_create_object(env, &item);
    napi_create_uint32(env, pid, &id);
    napi_create_string_utf16(env, reinterpret_cast<char16_t*>(path), length, &image);
    napi_set_named_property(env, item, "pid", id);
    napi_set_named_property(env, item, "image", image);
    napi_set_element(env, result, i, item);
  }
  return result;
}
static napi_value Close(napi_env env, napi_callback_info info) {
  auto job = Get(env, info);
  if (!job) return nullptr;
  if (job->handle) {
    if (!CloseHandle(job->handle)) return Fail(env, "CloseHandle failed");
    job->handle = nullptr;
  }
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"create", nullptr, Create, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"active", nullptr, Active, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"terminate", nullptr, Terminate, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"members", nullptr, Members, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 5, properties);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
