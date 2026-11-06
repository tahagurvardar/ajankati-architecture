#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <userenv.h>
#include <cstdio>
#include <cwchar>

// Trusted, test-only API inspection, NOT an LPAC fixture or launcher.
// No profile, process, file, registry, ACL or network mutation APIs are used.
// Attribute acceptance is not proof of launch, token identity or cleanup.
struct Resources {
  HANDLE token = nullptr;
  PSID sid = nullptr;
  LPPROC_THREAD_ATTRIBUTE_LIST attributes = nullptr;
  bool initialized = false;
  ~Resources() {
    if (initialized) DeleteProcThreadAttributeList(attributes);
    if (attributes) HeapFree(GetProcessHeap(), 0, attributes);
    if (sid) FreeSid(sid);
    if (token) CloseHandle(token);
  }
};
static int Failure(const char* stage, DWORD error) {
  std::fprintf(stderr, "%s:%lu\n", stage, error);
  return 1; // API failure, never DENIED or successful sandbox evidence.
}
int wmain(int argc, wchar_t** argv) {
  if (argc != 2 || std::wcscmp(argv[1], L"--inspect") != 0) return 2;
  TOKEN_ELEVATION elevation{};
  DWORD appContainer = 0, securityError = 0, lpacError = 0;
  MEMORYSTATUSEX memory{}; memory.dwLength = sizeof(memory);
  {
    Resources resources;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &resources.token))
      return Failure("OpenProcessToken", GetLastError());
    DWORD size = 0;
    if (!GetTokenInformation(resources.token, TokenElevation, &elevation, sizeof(elevation), &size))
      return Failure("TokenElevation", GetLastError());
    if (size != sizeof(elevation)) return Failure("TokenElevationSize", ERROR_INVALID_DATA);
    // Current process primary token, not an impersonation token.
    if (!GetTokenInformation(resources.token, TokenIsAppContainer, &appContainer, sizeof(appContainer), &size))
      return Failure("TokenIsAppContainer", GetLastError());
    if (size != sizeof(appContainer)) return Failure("TokenAppContainerSize", ERROR_INVALID_DATA);
    if (!GlobalMemoryStatusEx(&memory)) return Failure("GlobalMemoryStatusEx", GetLastError());

    // Name is synthetic and never used to create/open/delete a profile. SID
    // derivation does not establish whether a matching profile exists.
    const HRESULT derived = DeriveAppContainerSidFromAppContainerName(
      L"AjanKati.Lpac.InspectOnly", &resources.sid);
    if (FAILED(derived)) return Failure("DeriveSidHRESULT", static_cast<DWORD>(derived));
    if (!resources.sid || !IsValidSid(resources.sid)) return Failure("Sid", ERROR_INVALID_SID);

    SECURITY_CAPABILITIES capabilities{};
    capabilities.AppContainerSid = resources.sid; // Zero capability SIDs.
    DWORD policy = PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT;
    SIZE_T bytes = 0;
    if (InitializeProcThreadAttributeList(nullptr, 2, 0, &bytes) ||
        GetLastError() != ERROR_INSUFFICIENT_BUFFER || !bytes || bytes > 65536)
      return Failure("AttributeSize", ERROR_INVALID_DATA);
    resources.attributes = static_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(
      HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, bytes));
    if (!resources.attributes) return Failure("AttributeAllocate", ERROR_NOT_ENOUGH_MEMORY);
    if (!InitializeProcThreadAttributeList(resources.attributes, 2, 0, &bytes))
      return Failure("AttributeInitialize", GetLastError());
    resources.initialized = true;
    if (!UpdateProcThreadAttribute(resources.attributes, 0, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
        &capabilities, sizeof(capabilities), nullptr, nullptr)) securityError = GetLastError();
    if (!UpdateProcThreadAttribute(resources.attributes, 0, PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY,
        &policy, sizeof(policy), nullptr, nullptr)) lpacError = GetLastError();
    // Values must outlive the list, even though it is never passed to launch.
    DeleteProcThreadAttributeList(resources.attributes);
    resources.initialized = false;
  }
  std::printf("{\"version\":1,\"mode\":\"inspect-only\",\"decision\":\"NO-GO\","
    "\"executionAllowed\":false,\"liveExecution\":false,"
    "\"tokenElevated\":%s,\"callerAppContainer\":%s,"
    "\"totalPhysicalBytes\":%llu,\"availablePhysicalBytes\":%llu,\"memoryBudgetMet\":%s,"
    "\"sidDerived\":true,\"securityCapabilitiesAttributeError\":%lu,\"lpacAttributeError\":%lu,"
    "\"profilelessRuntime\":\"UNKNOWN\",\"lpacIdentity\":\"UNKNOWN\",\"runtimeCleanup\":\"UNKNOWN\"}\n",
    elevation.TokenIsElevated ? "true" : "false", appContainer ? "true" : "false",
    memory.ullTotalPhys, memory.ullAvailPhys, memory.ullAvailPhys >= 2ULL * 1024 * 1024 * 1024 ? "true" : "false",
    securityError, lpacError);
  return securityError || lpacError ? 1 : 0;
}
