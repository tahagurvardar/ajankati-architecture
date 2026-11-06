# Faz 1C-3B — Native Windows yol sınırı

Tarih: 6 Kasım 2026. Dal: `feat/phase-1c-3b-native-boundary`.
Başlangıç: `bea208fde5e56dafc4dc80ebb52ad056948dc952` (PR #14 merge).
Yerel ortam: Windows x64, Node 24.20.0, pnpm 11.25.0, MSVC Build Tools 2026.

## Uygulama ve güven sınırı

Yeni `path_boundary.node`, worker'ın senkron inceleme süresince kökten yaprağa
kadar açık tuttuğu handle'ları sahiplenir. `CreateFileW`, `OPEN_EXISTING`,
`FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS` kullanır.
Handle'lar miras bırakılmaz; yalnız `FILE_SHARE_READ` paylaşımı vardır. Dosya
okuma, yazma veya executable başlatma komutu native API'de yoktur.

Her bileşende `GetFileType=FILE_TYPE_DISK`, `FileAttributeTagInfo`,
`FileStandardInfo`, `FileIdInfo` ve `GetFinalPathNameByHandleW` sorgulanır.
Herhangi bir reparse attribute/tag, pending delete, yanlış dosya türü, dosyada
birden fazla hard link, farklı volume, sorgu hatası veya son yol uyuşmazlığı
reddedilir. Kısa DOS adları son kanonik yol karşılaştırmasında reddedilir.
Yalnız sabit yerel sürücü kabul edilir; UNC/device/drive-relative, ADS,
traversal, reserved adlar, NFC dışı yazım, sır dizinleri, SUBST ve mapped
drive alias'ları reddedilir. Herhangi bir tag için allowlist/bypass yoktur.

Handle sahibi N-API type tag ile doğrulanır; dışarı raw handle verilmez.
Explicit close idempotenttir, finalizer yedek temizlemedir. Açma sırasında hata
oluşursa önceki handle'lar RAII ile kapanır. Snapshot her bileşenin kimliğini,
son yolunu, türünü ve reparse durumunu tekrar sorgular.

`ManagedPreflight` yalnız kendi native çağrısından gelen `finalPath`, 64-bit
volume serial ve 128-bit file ID'yi kullanır. Executable ve workspace kimliğine
eklenen katı `native` nesnesi mevcut kanonik SHA-256 plan digest'ine dahildir;
scope dosyalarının native kimlikleri mevcut içerik digest'ine dahildir.
Hazırlama isteği yeni evidence alanı kabul etmez. Renderer/IPC route eklenmedi.

Eski `lstat`, tüm ata kontrolleri, `realpath`, hard-link reddi, fd kimlik
eşleşmesi, boyut sınırları ve hash öncesi/sonrası stat kontrolleri korunur.
256 MiB executable ve dosya başına 1 MiB scope sınırları değişmedi. Exact `.exe`
yolu ve byte SHA-256 şartı sürer. Native lease bu kontroller ve hash boyunca
açıktır; mevcut Node fd ayrı açılır ama native handle ve ata handle'ları bu
süre içinde tutulur. Son snapshot başarılı olmadan sonuç dönmez.

`native` alanı eski DB planlarının okunabilirliği için şemada opsiyoneldir.
Yeni worker her zaman üretir; eski alanı eksik planlar yeni kimlik
karşılaştırmasını geçemez. Eski onay yeniden kullanılmaz. SQLite şeması,
transaction, tek kullanımlık onay, workspace sahipliği, recovery ve katı digest
algoritması değiştirilmedi. Eski device/fileId alanları korunarak sahiplik
ledger'ının kimlik karşılaştırması muhafaza edildi.

## Açık kalan TOCTOU ve canlı görev engelleri

`nativePathBoundary=unknown` kalır. Bu faz yalnız inceleme süresindeki native
temeli gösterir; gelecek managed görevin bütün kullanım ömrünü doğrulamaz.

- Bir snapshot/SQLite satırı handle değildir. İnceleme sonunda handle'lar kapanır;
  sonradan aynı yol açılırsa yeni kimlik doğrulaması gerekir. Aynı byte'larla
  değiştirilmiş yeni dosya eski onayı geçemez.
- Workspace kökü scope incelemesi boyunca tutulur, fakat scope dosyaları sırayla
  açılır/kapatılır. Çok dosyalı atomik snapshot veya DB tüketimiyle dosya sistemi
  atomikliği iddia edilmez.
- Gelecek tüketici için kök, atalar, scope dosyaları ve executable handle'ları
  işlem boyunca tutulmalı; okuma aynı doğrulanmış handle üzerinden yapılmalıdır.
  Yeniden açma, süreç aktarımı, launcher ve kopma/recovery ayrı tasarım ister.
- Önceden oluşturulmuş yazılabilir memory mapping, filesystem filter/driver,
  volume namespace değişimi ve aynı kullanıcı saldırılarına karşı tam izolasyon
  gösterilmedi. Share-mode kilidi OS sandbox değildir. Kimlikler handle kapandıktan
  sonra sonsuza dek benzersiz kalma garantisi vermez.
- Yerel hesap file symlink fixture'ı oluşturamıyor (`EPERM`). Bu negatif test
  izinli Windows runner'da çalışır; izin yoksa gerekçeli skip verir. Yerel
  symlink doğrulaması iddia edilmez. Junction ve bilinmeyen tag testleri ayrıdır.
- `sandboxFilesystem`, `sandboxNetwork`, `toolGate`, `humanApprovalChannel`
  ve mevcut diğer canlı görev ön koşulları `unknown`; `liveExecution=failed`,
  `executionAllowed=false`. `authorizeExecution` koşulsuz reddeder.

Codex app-server veya canlı model görevi çalıştırılmadı. Global CLI ayarı,
credential dosyası, R1/R2/R3/R4 kanıtı değiştirilmedi/okunmadı. Yeni provider,
MCP, Claude, Ruflo veya ücretli altyapı eklenmedi. Desktop smoke CLI version
probe'ları `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0` ile kapalıdır.

## Regresyon kapsamı

Yeni native test dosyası yalnız win32 çalışır. Fixture kökü
`realpathSync.native(tmpdir())` ile kanonikleştirilir; hosted runner alias'ları
için üretim kontrolü gevşetilmez. Ubuntu mevcut platformdan bağımsız testleri
çalıştırır ve Windows native addon yüklemez.

Gerçek dosyalarla: açık lease sırasında leaf/ancestor rename ve yazma reddi;
önceden açık writer; lease sonrası aynı içerikle farklı kimlik; yanlış tür;
hard link; sahte/kapalı owner; junction leaf/ancestor; unsafe sözdizimi;
bilinmeyen gerçek reparse tag; varsa DOS 8.3 alias; izin varsa file symlink.
Ayrı `path_boundary_test.node`, leaf açılmadan hemen önce gerçek junction
substitution yapan deterministik checkpoint ve gerçek reparse fixture kurulumu/
temizliği sağlar. Bu test modülü paketlenmez; üretim modülünde hook yoktur.
Managed testleri native evidence enjeksiyonunu, digest tahrifini, scope/executable
aynı-içerik replacement'ını ve kapıların kapalı kalmasını doğrular.

## Doğrulama sonuçları

| Komut | Yerel sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; lockfile değişmedi |
| `pnpm verify` (ikinci tam koşu) | exit 0; lint/typecheck/build; 25 dosya, 302 geçti, 1 atlandı, 0 başarısız (303 toplam) |
| `pnpm test:desktop` | exit 0; CLI version probe kapalı; mock, CSP, UI, ConPTY ve cleanup geçti |
| `pnpm audit --prod` | exit 0; bilinen güvenlik açığı yok |
| `git diff --check` | exit 0 |

Atlanan tek test file symlink oluşturma yetkisi gerektiriyor. DOS 8.3 alias testi
yerelde çalıştı ve geçti; alias üretimi kapalı volume'lerde ayrı gerekçeli skip
verir. Desktop smoke'un kapalı sessions-start ve sahte UUID ret logları beklenen
negatif testlerdir. Bu sonuçlar Ubuntu koşusu değildir; yeni PR head'inin GitHub
matrisi ayrıca değerlendirilmelidir.

Önceki başarısızlıklar ve tekrarlar:

1. İlk RED: native addon henüz yokken 1 assertion başarısız, 14 test seçilmedi.
   pnpm bu ilk komutta bağımlılıkları yerel store'dan otomatik hazırladı.
2. İlk build exit 0 verdi; CJS `import.meta` ve `NOMINMAX` yeniden tanımı uyarıları
   düzeltildi. Mevcut renderer >500 kB chunk uyarısı devam eder.
3. İlk iki dosyalı koşu: 55 geçti, 1 başarısız. Native alanın JSON nesne sırası
   şemayla uyuşmadığından offline tüketim reddedildi. Sıra düzeltildi;
   tekrarında 56/56 geçti.
4. Ek fixture testlerinin ilk koşusu: test addon eksikliğinden 3 başarısız,
   16 seçilmedi. Bu koşu güvenlik doğrulaması değildir.
5. İlk tam `pnpm verify`: lint/typecheck/build başarılı; 301 geçti, 2 başarısız.
   Bilinmeyen reparse fixture'ının Node temizliği başarısızdı; native
   `FSCTL_DELETE_REPARSE_POINT` test temizliği eklendi. File symlink oluşturma
   `EPERM` verdi; açık koşullu skip eklendi. Aynı iki hata odaklı tekrarda da görüldü.
6. Bir odaklı test filtre komutu shell'in `|` ayrıştırması nedeniyle testlere
   ulaşmadan exit 1 verdi; dosyanın tamamı çalıştırılarak teşhis edildi.

## API dayanakları

- [CreateFileW: paylaşım ve reparse açma semantiği](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
- [GetFileInformationByHandleEx: kimlik, tür ve tag sorguları](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex)
- [Dosya kimliği ve 128-bit ID açıklaması](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information)
