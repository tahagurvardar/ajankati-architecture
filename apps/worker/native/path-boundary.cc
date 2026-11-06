#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <memory>

// An owner never exposes a raw HANDLE or accepts a caller-supplied identity.
// Root-to-leaf handles are non-inheritable and deny write/delete sharing.
struct Entry {
  HANDLE handle;
  std::wstring path;
  FILE_ID_INFO identity;
  bool directory;
};
struct Owner {
  std::vector<Entry> entries;
  void Close() {
    for (auto it = entries.rbegin(); it != entries.rend(); ++it) CloseHandle(it->handle);
    entries.clear();
  }
  ~Owner() { Close(); }
};
static const napi_type_tag ownerTag = {0xac139e382fe746baULL, 0xb66c49b8530d726aULL};
static napi_value Fail(napi_env env, const char* code) {
  napi_throw_error(env, nullptr, code);
  return nullptr;
}
static bool Equal(const std::wstring& a, const std::wstring& b) {
  return CompareStringOrdinal(a.c_str(), static_cast<int>(a.size()),
    b.c_str(), static_cast<int>(b.size()), TRUE) == CSTR_EQUAL;
}
static bool SafePath(const std::wstring& path) {
  if (path.size() < 4 || path.size() > 4000 || path[1] != L':' || path[2] != L'\\' ||
      !((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z'))) return false;
  if (!IsNormalizedString(NormalizationC, path.c_str(), static_cast<int>(path.size()))) return false;
  size_t start = 3;
  while (start < path.size()) {
    size_t end = path.find(L'\\', start);
    if (end == std::wstring::npos) end = path.size();
    std::wstring part = path.substr(start, end - start);
    if (part.empty() || part == L"." || part == L".." || part.back() == L'.' || part.back() == L' ') return false;
    for (wchar_t c : part) if (c < 32 || std::wstring(L"<>:\"|?*/").find(c) != std::wstring::npos) return false;
    for (const wchar_t* secret : {L".codex", L".claude", L".ssh", L".aws", L".env", L".git"}) {
      std::wstring name(secret);
      if (Equal(part, name) || (part.size() > name.size() && part[name.size()] == L'.' && Equal(part.substr(0, name.size()), name))) return false;
    }
    std::wstring base = part.substr(0, part.find(L'.'));
    if (Equal(base, L"CON") || Equal(base, L"PRN") || Equal(base, L"AUX") || Equal(base, L"NUL")) return false;
    if (base.size() == 4 && (Equal(base.substr(0, 3), L"COM") || Equal(base.substr(0, 3), L"LPT")) &&
        std::wstring(L"123456789¹²³").find(base[3]) != std::wstring::npos) return false;
    if (end == path.size()) return true;
    start = end + 1;
  }
  return false;
}
static bool Inspect(HANDLE handle, const std::wstring& expected, bool directory, FILE_ID_INFO* id, std::wstring* finalPath) {
  FILE_ATTRIBUTE_TAG_INFO tag{};
  FILE_STANDARD_INFO standard{};
  if (GetFileType(handle) != FILE_TYPE_DISK ||
      !GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &tag, sizeof(tag)) ||
      (tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) || tag.ReparseTag != 0 ||
      !GetFileInformationByHandleEx(handle, FileStandardInfo, &standard, sizeof(standard)) ||
      standard.DeletePending || !!standard.Directory != directory ||
      (!directory && standard.NumberOfLinks != 1) ||
      !GetFileInformationByHandleEx(handle, FileIdInfo, id, sizeof(*id))) return false;
  wchar_t buffer[32768];
  DWORD size = GetFinalPathNameByHandleW(handle, buffer, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  if (!size || size >= 32768) return false;
  std::wstring final(buffer, size);
  if (final.rfind(L"\\\\?\\", 0) != 0) return false;
  final = final.substr(4);
  if (!Equal(final, expected)) return false;
  *finalPath = final;
  return true;
}
static void Finalize(napi_env, void* data, void*) { delete static_cast<Owner*>(data); }
static Owner* Get(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value arg;
  bool tagged = false;
  void* data = nullptr;
  if (napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr) != napi_ok || argc != 1 ||
      napi_check_object_type_tag(env, arg, &ownerTag, &tagged) != napi_ok || !tagged ||
      napi_unwrap(env, arg, &data) != napi_ok || !data) {
    Fail(env, "Invalid path owner"); return nullptr;
  }
  return static_cast<Owner*>(data);
}
static napi_value Open(napi_env env, napi_callback_info info) {
#ifdef AJANKATI_TEST
  size_t supplied = 3;
  napi_value testArgs[3];
  napi_get_cb_info(env, info, &supplied, testArgs, nullptr, nullptr);
#endif
  size_t argc = 2, length = 0;
  napi_value args[2];
  bool directory = false;
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok ||
#ifdef AJANKATI_TEST
      (argc != 2 && argc != 3) ||
#else
      argc != 2 ||
#endif
      napi_get_value_string_utf16(env, args[0], nullptr, 0, &length) != napi_ok || length > 4000 ||
      napi_get_value_bool(env, args[1], &directory) != napi_ok) return Fail(env, "Invalid path request");
  std::vector<char16_t> input(length + 1);
  if (napi_get_value_string_utf16(env, args[0], input.data(), input.size(), &length) != napi_ok) return Fail(env, "Invalid path request");
  std::wstring path(reinterpret_cast<wchar_t*>(input.data()), length);
  if (!SafePath(path)) return Fail(env, "Unsafe Windows path");
  // No UNC, mapped remote drives, SUBST aliases or volume mount reparse points.
  std::wstring root = path.substr(0, 3);
  if (GetDriveTypeW(root.c_str()) != DRIVE_FIXED) return Fail(env, "Unsupported volume");
  wchar_t device[32768];
  if (!QueryDosDeviceW(path.substr(0, 2).c_str(), device, 32768) ||
      std::wstring(device).rfind(L"\\Device\\HarddiskVolume", 0) != 0) return Fail(env, "Drive alias rejected");
  auto owner = std::make_unique<Owner>();
  size_t end = 2;
  while (true) {
#ifdef AJANKATI_TEST
    if (end == path.size() && supplied == 3) {
      napi_value receiver, result;
      napi_get_undefined(env, &receiver);
      if (napi_call_function(env, receiver, testArgs[2], 0, nullptr, &result) != napi_ok) return nullptr;
    }
#endif
    std::wstring prefix = path.substr(0, end == 2 ? 3 : end);
    bool isDirectory = end != path.size() || directory;
    HANDLE handle = CreateFileW(prefix.c_str(), isDirectory ? FILE_READ_ATTRIBUTES : GENERIC_READ,
      FILE_SHARE_READ, nullptr, OPEN_EXISTING,
      FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS, nullptr);
    if (handle == INVALID_HANDLE_VALUE) return Fail(env, "Path open failed");
    FILE_ID_INFO id{};
    std::wstring final;
    if (!Inspect(handle, prefix, isDirectory, &id, &final) ||
        (!owner->entries.empty() && id.VolumeSerialNumber != owner->entries.front().identity.VolumeSerialNumber)) {
      CloseHandle(handle); return Fail(env, "Path boundary rejected");
    }
    owner->entries.push_back({handle, final, id, isDirectory});
    if (end == path.size()) break;
    end = path.find(L'\\', end + 1);
    if (end == std::wstring::npos) end = path.size();
  }
  napi_value result;
  if (napi_create_object(env, &result) != napi_ok ||
      napi_type_tag_object(env, result, &ownerTag) != napi_ok ||
      napi_wrap(env, result, owner.get(), Finalize, nullptr, nullptr) != napi_ok) return Fail(env, "Cannot retain path owner");
  owner.release();
  return result;
}
static napi_value Snapshot(napi_env env, napi_callback_info info) {
  Owner* owner = Get(env, info);
  if (!owner) return nullptr;
  if (owner->entries.empty()) return Fail(env, "Path owner closed");
  for (const auto& entry : owner->entries) {
    FILE_ID_INFO id{};
    std::wstring final;
    if (!Inspect(entry.handle, entry.path, entry.directory, &id, &final) ||
        id.VolumeSerialNumber != entry.identity.VolumeSerialNumber ||
        memcmp(id.FileId.Identifier, entry.identity.FileId.Identifier, 16) != 0) return Fail(env, "Path identity changed");
  }
  const auto& leaf = owner->entries.back();
  std::string fileId;
  const char* hex = "0123456789abcdef";
  for (BYTE b : leaf.identity.FileId.Identifier) { fileId += hex[b >> 4]; fileId += hex[b & 15]; }
  napi_value result, value;
  napi_create_object(env, &result);
  napi_create_string_utf16(env, reinterpret_cast<const char16_t*>(leaf.path.c_str()), leaf.path.size(), &value);
  napi_set_named_property(env, result, "finalPath", value);
  std::string serial = std::to_string(leaf.identity.VolumeSerialNumber);
  napi_create_string_utf8(env, serial.c_str(), serial.size(), &value);
  napi_set_named_property(env, result, "volumeSerial", value);
  napi_create_string_utf8(env, fileId.c_str(), fileId.size(), &value);
  napi_set_named_property(env, result, "fileId", value);
  return result;
}
static napi_value Close(napi_env env, napi_callback_info info) {
  Owner* owner = Get(env, info);
  if (!owner) return nullptr;
  owner->Close();
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
#ifdef AJANKATI_TEST
#include "path-boundary-test.h"
#endif
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"open", nullptr, Open, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"snapshot", nullptr, Snapshot, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 3, properties);
#ifdef AJANKATI_TEST
  napi_property_descriptor fixtures[] = {
    {"unknownReparse", nullptr, UnknownReparse, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"removeUnknownReparse", nullptr, RemoveUnknownReparse, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"shortPath", nullptr, ShortPath, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 3, fixtures);
#endif
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
