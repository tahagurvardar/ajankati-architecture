# Faz 1C-2C — Native stdio sahipliği; inference KAPALI

29 Ekim 2026, Windows x64 10.0.26300, Node 24.20.0, Electron 45.0.0.
Bu teslim Job Object yaşam döngüsü temelidir; dosya/ağ sandbox'ı değildir.

## Uygulama ve sınırlar

`stdio-owner.cc`, mevcut ConPTY yolundan ayrı bir Node-API modülüdür.
Yalnız modülün yanındaki `codex.exe` ve sabit `app-server --listen stdio://`
argümanlarını kullanır. Renderer executable/argv/cwd/env seçemez. PATH ve shell
yoktur. SHA-256 native kodda sabittir:
`6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36`
(önceki 2B kanıtındaki 0.164.0; yerel kurulumda tekrar hash kontrolü yapıldı).
Hash bir yayıncı imzası veya bütün DLL bağımlılıklarının doğrulaması değildir.

İmaj handle'ı write/delete paylaşımı olmadan açılır ve BCrypt SHA-256 bu handle
üzerinden hesaplanır. Yerel DOS yolu dışındakiler ve reparse bileşenleri reddedilir;
üst dizin handle'ları da write/delete paylaşımı olmadan tutulur. Kilitler süreç
ömrünce korunur. Node'un `\\?\` yerel DOS öneki normalize edilir; UNC açılmaz.
Build Codex indirmez/kurmaz; yalnız açık operator hazırlığı mevcut hash eşleşen
native dosyayı ignore edilen dist'e kopyalar. Kimlik değişirse yeniden inceleme gerekir.

Adsız, non-inheritable job üzerinde `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` kurulur.
`CreateProcessW`, `PROC_THREAD_ATTRIBUTE_JOB_LIST`, `CREATE_SUSPENDED` ve yalnız
stdin/stdout/stderr içeren `HANDLE_LIST` kullanır. `IsProcessInJob` doğrulanmadan
resume edilmez. Sonradan çalışan PID'yi işe bağlama yolu yoktur. Başlatma hataları
fail-closed; PID listesinden öldürme yoktur. Membership hata yolunda yalnız dönen
creation handle'ı sonlandırılabilir. Normal kapatmada job terminate + accounting=0
gerekir; hatada son handle'ı kapatma fallback'i başarı kanıtı sayılmaz ve yeniden
başlatma zehirlenir. İkinci eşzamanlı native grup reddedilir.

Microsoft: [creation-time Job listesi ve handle listesi](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute),
[askıda thread oluşturma](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags),
[Job nesneleri](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
Testler kernel içindeki her instruction'ı kesmenin kanıtı değildir; CreateProcess
içindeki association atomikliği Windows API sözleşmesine dayanır. Desteklenmeyen
attribute/nested-job koşulunda fallback launcher yoktur.

Stdio ayrı worker thread'inde çalışır. Native okumalar en fazla 16 KiB; yalnız
bir onaysız çıktı mesajı tutulur. Yazma kuyruğu 64 KiB/64 mesajla sınırlıdır.
Stdin yerel, 128-bit rastgele adlı named pipe, kullanıcı+SYSTEM DACL ve explicit
inheritance ile kurulur. Overlapped yazmada 1 saniye deadline, cancellation drain
vardır. Stderr içerikleri saklanmaz; toplam 256 KiB aşımında süreç kapanır.
15 saniye native-thread deadline, 18 saniye dış watchdog, 4 saniye cleanup bütçesi
bulunur. Ana worker event loop'u native beklemelerle bloklanmaz. Kernel'in
cancellation işlemini sonsuza dek geciktirmesine karşı hard-real-time garanti yoktur;
dış watchdog bu durumda cleanup'ı doğrulanmamış bildirir.
Native launch ayrıca monotonic 5 saniye bütçesini CreateProcess ve ResumeThread
öncesi kontrol eder: gecikmiş hash/Windows çağrısı, dış watchdog kapandıktan sonra
hedefi sessizce çalıştırmaya devam edemez. İki deadline checkpoint testi önce kırmızı
görüldü; hedef oluşturma ve askıdan çıkarma sınırlarını ayrı sınar.

## Protokol, profil ve insan onayı

Mevcut driver'ın initialize mesajı ortaklaştırıldı. Turn çalıştıran
`CodexProtocolSession` fixture-only kalır. Ayrı `initializeOnly` yalnız initialize
yanıtını doğrular, initialized yazmasının tamamlanmasını bekler ve işi kapatır.
UTF-8, JSON, boyut, partial frame, beklenmeyen/server-initiated istekler reddedilir.
`thread/start`, `turn/start`, `model/list`, login veya approval göndermez.
İnference/turn interrupt ve model yetkisi bu testin sonucu değildir.

Operator komutları (repo kökünden; normal build hiçbirini çağırmaz):

```powershell
node apps/worker/dist/codex-probe.cjs --prepare
# Çıktıdaki somut plan için ayrıca insan onayından SONRA:
node apps/worker/dist/codex-probe.cjs --approve-initialize-only
```

Hazırlık benzersiz, boş dist profili üretir. Native environment allowlist yalnız
Windows dizini ve bu profile yönlendirilmiş HOME/USERPROFILE/APPDATA/LOCALAPPDATA/
TEMP/TMP/CODEX_HOME içerir. Provider key/token/proxy/PATH/NODE_OPTIONS aktarılmaz.
Uygulama kullanıcı auth dosyası okumaz veya kopyalamaz. Profil ephemeral auth,
file-only MCP credential store, analytics/feedback/update kapalı ve history=none
kullanır. MCP/plugin/hook tanımı, login, güvenlik bypass veya otomatik tool onayı yoktur.
Global Claude/Codex ayarları değiştirilmez.

[0.164.0 config loader](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/config/src/loader/mod.rs)
incelendi: CODEX_HOME tek başına makine politikasını izole etmez. Native gate,
Windows KnownFolder ProgramData/OpenAI/Codex dizini veya 64-bit HKLM
SOFTWARE/Policies/OpenAI/Codex anahtarı varsa probe'u reddeder; okuma hatasını
yokluk saymaz. Üst dizinlerde `.codex` varsa operator aracı da reddeder. Mevcut
politika devre dışı bırakılmaz. [Ephemeral auth uygulaması](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/login/src/auth/storage.rs)
bellek içi store kullanır. [Sabit varsayılanlar](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/config/defaults.toml)
ve [app-server başlangıcı](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/lib.rs)
da incelendi. Kaynak incelemesi ağ trafiği ölçümü değildir.

Tek kullanımlık plan, exclusive lock ve ayrı `codex-probe-ledger.sqlite` rezervasyonu
launch'tan önce yazılır. Cleanup belirsizse lock/ledger karantinası korunur; otomatik
retry yoktur. Kayıtta yalnız doğrulanabilen lifecycle metadata bulunur; prompt,
credential veya transcript yoktur. Token NULL, cost/quota UNKNOWN kalır. Kullanıcının
appData DB'si açılmaz; SQLite v2 şeması değişmedi.

Gerçek Codex handshake durumu: insan onayı bekleniyor; henüz çalıştırılmadı.

## Doğrulama kaydı

- İlk eksik-modül testi kırmızı; mevcut 100 test geçti. İlk native çalıştırma DOS
  öneğini reddetti. Düzeltmeden sonra fixture'da 3 yerine Windows conhost'larıyla
  6 üye görüldü; kontroller tüm job üyelerine genişletildi.
- Native/transport odaklı koşu: 14/14 geçti. Ardından initialize-only driver'ın
  gerçek fixture taşıması ve malformed/partial kontrolleri eklendi.
- Son native gözlem: kök **13280**, job üyeleri **13280/1984/5672/18484/18848/4428**;
  resume öncesi membership doğrulanmış, istenmeyen sentinel inheritance=false.
  Native termination sonrası **ActiveProcesses 6 → 0**. PID'ler yalnız bu koşuya
  ait gözlem; sonlandırma yetkisi job handle'ıdır.
- İlk tam `pnpm verify`: 21 dosyada 123/123 geçti, 59,28 sn test süresi.
- Sıkılaştırma sonrası `pnpm verify`: 21 dosyada **126/126**, 57,64 sn; lint,
  typecheck ve native build geçti. İnceleme sonrası pending-write crash testi
  eklendi. Son native deadline kontrolleri dahil `pnpm verify` **129/129**,
  21 dosya, **56,49 sn**, çıkış 0 (01:46 koşusu). Lint/typecheck/MSVC build geçti.
- `pnpm audit --prod`: bilinen güvenlik açığı bulunmadı.
- İlk desktop smoke UI/CSP/kapalı sessions kontrollerinden sonra terminal aşamasında
  60 saniye genel timeout'a girdi. Daha sonra onunla çakışan build,
  `terminal-node.exe` kopyalamada EBUSY verdi. Smoke kapandıktan sonra süreç sorgusu
  tanılama hedefi göstermedi; PID üzerinden kill yapılmadı. Kontroller sırayla
  tekrarlandı; timeout eşiği veya üretim güvenlik ayarı değiştirilmedi.
- Son `pnpm test:desktop` tek başına çıkış 0: A+C düzeni, viewport/zoom,
  CSP/sandbox, sessions/v1 start reddi, CLI discovery, Türkçe ConPTY/Ctrl+C,
  navigation sürekliliği ve SQLite/mock/insan kabul akışı geçti. Gerçek tanılama
  branch/leaf **9372/19016** kapandı. Bu PID'ler Codex kanıtı değildir.
- `pnpm exec tsx scripts/measure-worker-idle.ts`: gerçek üretim worker'ı,
  izole SQLite, GUI/Codex yok. **20,602 sn** örnekte working set **60,39 MiB**,
  private memory **26,92 MiB**, CPU **0,0625 sn**; tek çekirdek ölçeğinde **%0,303**,
  12 mantıksal işlemcili makine ölçeğinde **%0,0253**. Handle sayısı **191 → 191**.
  Bu bir kısa baseline örneğidir; tüm Electron uygulamasının ölçümü veya eski/yeni
  karşılaştırmalı RAM farkı değildir. Kapalı ürün yolunda native stdio thread'i açılmaz.
- Bağımsız kod incelemesi kritik/önemli bulgu bildirmedi; ek pending overlapped
  write owner-death kanıtı önerisi ayrı test-only checkpoint ile eklendi.
- Bir tam koşuda rapid-restart fixture testi kırmızı oldu. Testin sayısal handle
  değerinin child'da geçerli olmasını inheritance sanabildiği görüldü; Windows
  değerleri farklı nesneler için yeniden kullanabilir. Sentinel kontrolü artık
  owner'daki asıl event'in sinyallenmesini ölçüyor. Fixture başlangıç beklemesi
  üretimin 15 saniyelik sınırı içinde 3 saniye; bu kernel güvenlik kontrolünü gevşetmez.
- Bu test-only sentinel'in kapanış eklemesiyle aynı anda tamamlanan eski derleme,
  her çevrimde +1 handle gösterdi. Kaynakla eşleşen tam rebuild sonrası ayrı Node
  gözleminde ilk console ısınmasından sonra 11 çevrim boyunca **208 handle sabit**
  kaldı. Üretim modülünde sentinel veya fault checkpoint bulunmaz.
- Test-only `_test.node` ve fixture exe dist'e kopyalanmaz. CI yalnız fixture
  çalıştırır; Codex binary hazırlığı/handshake/inference otomatik testlerde yoktur.
- Cleanup-failure testi native test derlemesinde hata enjeksiyonudur; gerçek
  Windows kernel arızası diye sunulmaz. Gerçek job son-handle fallback'i ayrıca gözlenir.
- MSVC artımlı build iki kez LNK1103 verdi; tam `node-gyp rebuild` ile derlendi.
  Mevcut build zaten rebuild kullanır. Vite'ın önceki >500 kB uyarısı korunur.

## Açık sınırlar ve Phase 1C-2D

Job Object dosya/ağ sandbox'ı değildir. Aynı kullanıcı saldırganı, yöneticinin
eşzamanlı politika değişimi, dış süreç broker'ları, uyku/uyanma, paket imzası ve
bağımlı DLL güveni için yeni garanti yoktur. Bu test process ownership temelidir;
Windows provider sandbox, gerçek görev, izin ekranı veya model erişimi kanıtı değildir.
Karşılaştırmalı eski/yeni tüm-Electron RAM/CPU ve 8 GB kapasitesi ayrı ölçüm ister.

`SessionHost` kapalıdır; UI/env flag ile canlı çalıştırmaya geçiş yoktur. ConPTY,
demo görevleri, CLI keşfi, A+C UI, `.serena` ve `design-reference` korunur.

Önerilen 2D: önce insan onaylı initialize-only kanıtı ve paketli Electron/worker
uyumluluğu; ardından ayrı izole proje ve CLI'nin insan tarafından yönetilen auth'u,
doğrulanmış Windows dosya/ağ politikası ve görünür tek seferlik onay. En fazla
30 saniye, retry=0, yalnız selamlama isteyen tek turn; her beklenmeyen araç/izin
isteğinde durdurma. Tamamlama/interrupt/timeout/worker-crash denemeleri ayrı
onaylarla ve gerçek ledger+job=0 karşılaştırmasıyla yapılmalı. Bu teslim inference
onayı değildir; UNKNOWN maliyetten fiyat/abonelik yetkisi çıkarılmaz.
