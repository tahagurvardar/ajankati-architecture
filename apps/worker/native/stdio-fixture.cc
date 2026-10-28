#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>

// Harmless native test target. No shell, files, auth, network or PID watchdog.
int wmain(int argc, wchar_t** argv) {
  int depth = argc > 1 ? _wtoi(argv[1]) : 0;
  if (depth < 2) {
    wchar_t image[32768]{};
    GetModuleFileNameW(nullptr, image, 32768);
    std::wstring command = L"\"" + std::wstring(image) + L"\" " + std::to_wstring(depth + 1);
    STARTUPINFOW startup{}; startup.cb = sizeof(startup);
    PROCESS_INFORMATION child{};
    if (!CreateProcessW(image, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                        nullptr, nullptr, &startup, &child)) return 2;
    CloseHandle(child.hThread); CloseHandle(child.hProcess);
  }
  if (depth != 0) { Sleep(60000); return 0; }
  DWORD count;
  // Numeric handle values can be reused in the child. Observe the original event
  // in the owner instead of treating any reused numeric value as inheritance.
  if (argc > 2) SetEvent(reinterpret_cast<HANDLE>(_wcstoui64(argv[2], nullptr, 10)));
  char buffer[4096];
  while (ReadFile(GetStdHandle(STD_INPUT_HANDLE), buffer, sizeof(buffer), &count, nullptr) && count) {
    std::string input(buffer, count);
    if (input.find("stall") != std::string::npos) { Sleep(60000); return 0; }
    if (input.find("partial") != std::string::npos) {
      WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), "{", 1, &count, nullptr); return 0;
    }
    if (input.find("invalid") != std::string::npos) {
      const char invalid[] = { char(0xff), '\n' };
      WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), invalid, 2, &count, nullptr); continue;
    }
    if (input.find("initialize") != std::string::npos && input.find("initialized") == std::string::npos) {
      const char reply[] = "{\"id\":1,\"result\":{\"userAgent\":\"fixture\"}}\n";
      WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), reply, sizeof(reply)-1, &count, nullptr);
    } else WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), buffer, count, &count, nullptr);
  }
  return 0;
}
