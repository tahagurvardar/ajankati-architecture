#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#ifdef AJANKATI_TEST
#include <cstdio>
static const wchar_t* stage = L"";
static HANDLE testOwner = nullptr;
static void Checkpoint(const wchar_t* name) {
  if (wcscmp(stage, name) != 0) return;
  wprintf(L"STAGE:%ls\n", name);
  fflush(stdout);
  // Deterministic test barrier: no scheduling window can resume the target
  // before the owner dies. This is not a production watchdog or ownership path.
  WaitForSingleObject(testOwner, INFINITE);
  CloseHandle(testOwner);
  testOwner = nullptr;
}
#else
static void Checkpoint(const wchar_t*) {}
#endif

// This trusted gate accepts a random job name ONLY. Never executes renderer text,
// a shell, PATH lookup, caller-supplied executable, arguments or environment.
// node-pty starts the gate running; it cannot create descendants until joined.
int wmain(int argc, wchar_t** argv) {
#ifdef AJANKATI_TEST
  if (argc != 4) return 100;
  stage = argv[2];
  testOwner = OpenProcess(SYNCHRONIZE, FALSE, wcstoul(argv[3], nullptr, 10));
  if (!testOwner) return 109;
  argc = 2;
#endif
  if (argc != 2 || wcslen(argv[1]) != 51 || wcsncmp(argv[1], L"Local\\AjanKati-", 15) != 0) return 100;
  Checkpoint(L"before-open");
  HANDLE job = OpenJobObjectW(JOB_OBJECT_ASSIGN_PROCESS | JOB_OBJECT_QUERY, FALSE, argv[1]);
  if (!job) return 101;
  Checkpoint(L"after-open");
  if (!AssignProcessToJobObject(job, GetCurrentProcess())) {
    CloseHandle(job);
    return 102;
  }
  Checkpoint(L"after-association");
  // Explicit JOB_LIST also makes creation atomic if the bootstrap changes later.
  // CREATE_SUSPENDED allows membership verification before any target code runs.
  wchar_t module[32768];
  DWORD length = GetModuleFileNameW(nullptr, module, 32768);
  if (!length || length == 32768) { CloseHandle(job); return 103; }
  std::wstring directory(module, length);
  directory.resize(directory.find_last_of(L'\\') + 1);
#ifdef AJANKATI_TEST
  directory += L"..\\..\\..\\dist\\";
#endif
  std::wstring executable = directory + L"terminal-node.exe";
  std::wstring command = L"\"" + executable + L"\" \"" + directory + L"safe-echo.cjs\"";
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
  std::vector<BYTE> memory(size);
  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(memory.data());
  if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &size)) { CloseHandle(job); return 104; }
  if (!UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
       &job, sizeof(job), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(startup.lpAttributeList);
    CloseHandle(job);
    return 105;
  }
  PROCESS_INFORMATION child{};
  BOOL created = CreateProcessW(executable.c_str(), &command[0], nullptr, nullptr, FALSE,
    EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED, nullptr, nullptr, &startup.StartupInfo, &child);
  DeleteProcThreadAttributeList(startup.lpAttributeList);
  if (!created) { CloseHandle(job); return 106; }
  Checkpoint(L"suspended");
  BOOL member = FALSE;
  bool verified = IsProcessInJob(child.hProcess, job, &member) && member;
  // Drop the transient job reference before resuming. The worker is now the sole
  // handle owner. Worker death here kills both the gate and suspended target.
  bool closed = CloseHandle(job) != FALSE;
  Checkpoint(L"before-resume");
  if (!verified || !closed || ResumeThread(child.hThread) == static_cast<DWORD>(-1)) {
    // Handle from this CreateProcess only; never look up a process by PID.
    TerminateProcess(child.hProcess, 107);
    CloseHandle(child.hThread);
    CloseHandle(child.hProcess);
    return 107;
  }
  CloseHandle(child.hThread);
  DWORD code = 108;
  if (WaitForSingleObject(child.hProcess, INFINITE) == WAIT_OBJECT_0)
    GetExitCodeProcess(child.hProcess, &code);
  CloseHandle(child.hProcess);
  return static_cast<int>(code);
}
