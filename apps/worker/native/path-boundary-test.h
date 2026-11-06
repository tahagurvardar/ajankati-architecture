// Compiled ONLY into path_boundary_test.node; never packaged in worker/dist.
#include <winioctl.h>
static std::wstring FixturePath(napi_env env, napi_callback_info info) {
  size_t argc = 1, length = 0;
  napi_value arg;
  napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr);
  if (argc != 1 || napi_get_value_string_utf16(env, arg, nullptr, 0, &length) != napi_ok || length > 4000) return L"";
  std::vector<char16_t> buffer(length + 1);
  napi_get_value_string_utf16(env, arg, buffer.data(), buffer.size(), &length);
  return std::wstring(reinterpret_cast<wchar_t*>(buffer.data()), length);
}
static napi_value UnknownReparse(napi_env env, napi_callback_info info) {
  std::wstring path = FixturePath(env, info);
  if (!SafePath(path)) return Fail(env, "Invalid fixture path");
  HANDLE handle = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
    FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS, nullptr);
  if (handle == INVALID_HANDLE_VALUE) return Fail(env, "Fixture open failed");
  struct { DWORD tag; WORD length; WORD reserved; GUID guid; } data{
    0x00000042, 0, 0, {0xeef1164d, 0x047d, 0x4eca, {0xb4, 0x0a, 0xf6, 0xfa, 0xaa, 0x6d, 0x11, 0x53}}
  };
  DWORD returned = 0;
  BOOL ok = DeviceIoControl(handle, FSCTL_SET_REPARSE_POINT, &data, sizeof(data), nullptr, 0, &returned, nullptr);
  CloseHandle(handle);
  if (!ok) return Fail(env, "Fixture reparse creation failed");
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value RemoveUnknownReparse(napi_env env, napi_callback_info info) {
  std::wstring path = FixturePath(env, info);
  if (!SafePath(path)) return Fail(env, "Invalid fixture path");
  HANDLE handle = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
    FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS, nullptr);
  if (handle == INVALID_HANDLE_VALUE) return Fail(env, "Fixture open failed");
  struct { DWORD tag; WORD length; WORD reserved; GUID guid; } data{
    0x00000042, 0, 0, {0xeef1164d, 0x047d, 0x4eca, {0xb4, 0x0a, 0xf6, 0xfa, 0xaa, 0x6d, 0x11, 0x53}}
  };
  DWORD returned = 0;
  BOOL ok = DeviceIoControl(handle, FSCTL_DELETE_REPARSE_POINT, &data, sizeof(data), nullptr, 0, &returned, nullptr);
  CloseHandle(handle);
  if (!ok) return Fail(env, "Fixture reparse removal failed");
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value ShortPath(napi_env env, napi_callback_info info) {
  std::wstring path = FixturePath(env, info);
  if (!SafePath(path)) return Fail(env, "Invalid fixture path");
  wchar_t buffer[32768];
  DWORD count = GetShortPathNameW(path.c_str(), buffer, 32768);
  if (!count || count >= 32768) return Fail(env, "Fixture short path failed");
  napi_value result;
  napi_create_string_utf16(env, reinterpret_cast<char16_t*>(buffer), count, &result);
  return result;
}
