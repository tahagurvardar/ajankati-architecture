# Faz 1C-3A — Yönetilen Codex görevi için çevrimdışı ön denetim

Tarih: 6 Kasım 2026. Dal: `feat/phase-1c-3a-managed-task-preflight`.
Ortam: Windows x64, Node 24.20.0, pnpm 11.25.0.

## Kapsam ve güven sınırı

Bu faz canlı görev yürütmez. `ManagedPreflight.authorizeExecution` her zaman
reddeder; durum sözleşmesinde `executionAllowed` yalnız `false` olabilir.
`SessionHost` hâlâ yalnız listelemeyi kabul eder. Mevcut `task.run` yalnız mock
adaptörünü kullanır. `CodexProtocolSession` fixture sürücüsü olarak kalır.
Yeni bir renderer/IPC plan oluşturma veya insan onayı komutu açılmadı.

Dayanaklar: [adaptör sözleşmesi](../03-AGENT-ADAPTERS.md),
[güvenlik modeli](../04-SECURITY-MODEL.md),
[orkestrasyon/kalite](../10-AUTONOMOUS-ORCHESTRATION-AND-QUALITY.md),
[yol haritası](../11-REVISED-MVP-ROADMAP.md) ve
[risk/kararlar](../12-ARCHITECTURAL-RISKS-AND-DECISIONS.md).

R4 tüketilmiş, initialize-only kanıttır. Kullanıcının bildirdiği
`initialized=true`, `cleaned=true`, `outputDrained=true`, `exitCode=0` ve
`remoteControl/status/changed` bu fazda tekrar ölçülmedi. R1/R2/R3/R4 ve native
runtime kaynakları değiştirilmedi. Codex app-server, canlı model görevi veya
global CLI kimlik bilgisi okuması yapılmadı. Doğrulama komutları mevcut yerel
diagnostic/ConPTY fixture süreçlerini çalıştırdı; bunlar provider görevi değildir.

## Sözleşme ve uygulama

- Plan; proje/görev kimliği, görev revizyonu ve başlık özeti, benzersiz plan/run
  kimliği, ilk run revizyonu `0`, executable yolu/dosya kimliği/SHA-256,
  workspace yolu/dosya kimliği ve seçili dosyaların içerik özetini bağlar.
- Kapsam en fazla 64 açık göreli dosya; tek işlem `read-file`. Shell, yazma, ağ,
  Git ve uzantı işlemleri bu politikada ifade edilemez. Executable inceleme
  sınırı 256 MiB, seçili dosya başına sınır 1 MiB. Dosya gövdeleri DB'ye yazılmaz.
- Politika `offline-read-only-v1`; geçerlilik en fazla beş dakika. Tam sona erme
  anında ret; oluşturma/karar zamanından önceki saat değerinde ret vardır.
  Saatin aynı geçerlilik aralığında geriye gitmesine karşı monotonic süre kanıtı
  yoktur; bu canlı yürütme engellerinden biridir.
- SHA-256 girdisi `ajankati-managed-plan-v1` ve satır sonu ile ayrılmış kanonik
  JSON'dur. Nesne anahtarları UTF-16 sırasına göre sıralanır; dizi sırası korunur.
  Worker kapsamı sıralar. Şema bilinmeyen alanları reddeder; iç içe kimlikler ve
  diziler dahil plan dondurulur. Her DB okumasında digest yeniden hesaplanır.
- İnsan kararı `approvalId`, `planId`, `actionDigest`, `runId`, `policyVersion`,
  `expiresAt`, `decidedAt`, `actor` ve `approve-once|deny` alanlarını taşır.
  Plan başına tek karar vardır. Ret sonradan onaya çevrilemez; yeni plan gerekir.
  `actor` bu fazda güvenilir insan kimlik doğrulaması değildir. Bu nedenle
  `humanApprovalChannel=unknown` kalır; renderer'ın kendi `approved=true`
  beyanı bu sözleşmede izin değildir.
- `consumeOfflineReview`, yalnız çevrimdışı inceleme için kararı bir kez tüketir
  ve sahipliği rezerve eder. Çalıştırma izni üretmez, bir provider'a karar yollamaz.
  Worker giriş noktası tüketmeden önce görev, executable, seçili dosyalar,
  süre, karar ve sahipliği yeniden denetler. Alt seviye storage metodu yalnız
  ledger tutarlılığını sağlar; dosya sistemi güvenlik kapısı değildir.

## SQLite ve kurtarma

Şema v3, mevcut worker `Store` bağlantısındaki üç tabloyu ekler: planlar,
kararlar, workspace sahipliği. İkinci uygulama yazıcısı veya ikinci DB yoktur.
v1/v2 yükseltmesinden önce benzersiz `VACUUM INTO` yedeği alınır; yükseltme
transaction içindedir. Bozuk/yeni sürümlü DB yerine boş DB oluşturulmaz.

Onayın tüketilmesi, sahiplik rezervasyonu ve plan durumu tek `BEGIN IMMEDIATE`
transaction'ındadır. Aynı yol, büyük/küçük harf eşdeğeri, üst/alt dizin veya aynı
device/file ID çakışması reddedilir. Sahiplik tablosuna insert hata enjeksiyonunda
kararın tüketilmediği; rakip SQLite writer kilidinde kısmi yazma olmadığı test edildi.
Bu yalnız SQLite transaction sınırındaki kanıttır: gerçek disk/power-loss deneyi,
dosya inceleme + DB atomikliği veya dış teslim exactly-once kanıtı değildir.

Recovery bekleyen/onaylı/tüketilmiş planları `interrupted` yapar. Tüketim kaydı
ve sahiplik korunur; sona erme veya restart kilidi otomatik açmaz. Bu fazda sahiplik
serbest bırakma/uzlaştırma API'si yoktur. Gelecek faz bunu açık insan kararı ve
doğrulanmış süreç temizliğiyle tasarlamalıdır; otomatik retry yapılmamalıdır.

## Kapıların anlamı

`sessions/v1` liste yanıtı `capability.preflight` alanını taşır. Seçilmiş plan
olmadığından genel listedeki offline kapılar `unknown`'dır. Worker içindeki
plan incelemesi şu ayrımı yapar:

| Kapı | Bu fazın kanıtı |
|---|---|
| plan | Katı şema ve yeniden hesaplanan kanonik digest |
| task | Mevcut ready görevi, proje, revizyon ve başlık özeti |
| executable | Seçilmiş dosyanın kimliği ve byte özeti aynı; bunun Codex olduğuna veya güvenilir sürüme dair kanıt değil |
| workspace | Kök kimliği ve yalnız seçili dosyaların kimlik/içerik özeti aynı; tüm repo snapshot'ı değil |
| approval | Tam plana bağlı, süresi geçmemiş, tüketilmemiş karar kaydı; insan kanalının gerçekliği değil |
| ownership | Ledger'da çakışan sahiplik yok; OS kilidi/sandbox değil |
| validity | Beş dakikalık duvar saati aralığı geçerli |
| providerCompatibility | unknown |
| nativePathBoundary | unknown |
| sandboxFilesystem / sandboxNetwork | unknown / unknown |
| toolGate / sessionIsolation / processOwnership | unknown / unknown / unknown |
| humanApprovalChannel | unknown |
| liveExecution | failed; bu fazda sabit kapalı |

UNC/device/drive-relative yolları, traversal, ADS, ayrılmış Windows adları,
sonunda nokta/boşluk, NFC olmayan yazım ve bilinen sır/ayar dizinleri reddedilir.
Kök ve scope atalarındaki normal junction/symlink'ler, hard link dosyalar ve
realpath alias'ları reddedilir. `lstat` tüm reparse tag'lerini doğrulamaz;
kontrol/açma yarışını bütünüyle kapatmaz. Native handle kapısı bu nedenle unknown
kalır. Kimlik/hash eşleşmesi OS izolasyonu değildir; aynı kullanıcı DB saldırısına
karşı kriptografik yetki veya değiştirilemez disk kaydı iddiası yoktur.

## Testler ve gerçek sonuçlar

Yeni `tests/managed-preflight.test.ts`: 41 test. Kapsam: değişmezlik, digest/run/
politika/plan uyuşmazlığı, süre/erken saat, replay, ret, kurtarma, üst/alt workspace,
transaction rollback, writer contention, v2 migration/yedek/restore, bozuk
migration, dosya değişimi, scope junction, hard link ve Windows yol negatifleri.
Mevcut storage testleri v3'e uyarlandı; mock yaşam döngüsü korundu.

| Komut | Sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; lockfile değişmedi |
| `pnpm verify` (düzeltme sonrası) | exit 0; lint, typecheck, build; 24 dosya / 282 test geçti |
| `pnpm test:desktop` (`AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0`) | exit 0; mock kabulü, kapalı sessions, CSP, layout, ConPTY ve cleanup geçti; CLI version probe yok |
| `pnpm audit --prod` | exit 0; bilinen güvenlik açığı bulunmadı |
| Odaklı üç dosya | 49 test geçti |

Önceki başarısızlıklar saklanmadan raporlanır:

1. İlk test komutu pnpm store lock erişiminde durdu (`ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`).
   İzinli tekrar çalıştırıldı.
2. `pnpm test -- tests/managed-preflight.test.ts` pnpm sürümünün argüman aktarımı
   nedeniyle tüm suite'i çalıştırdı. Build henüz yoktu: 8 dosya başarısız,
   16 başarılı; 79 test başarısız, 185 başarılı. Yeni test dosyasındaki 23
   başarısızlık eksik sözleşme/modülden; diğer başarısız dosyalar
   `terminal`, `containment`, `worker`, `stdio-transport`, `terminal-crash`,
   `native-stdio`, `containment-startup` testleriydi (worker/native build eksikliği).
   Sonraki odaklı komutlar `pnpm exec vitest run ...` kullandı.
3. Sözleşme RED testi `managedPlanSchema` yokluğunda assertion ile başarısız oldu.
   Scope içerik değişimi ve scope içi junction testleri ilk uygulamada gerçekten
   başarısız oldu; kimlik/içerik incelemesi eklenince geçti.
4. Migration testlerinin eski v2 beklentisi ve v1 fixture'ındaki v3 tabloları iki
   hata üretti; fixture sürümü doğru kurularak güncellendi.
5. Worker tüketim metodu eklenmeden yeni sınır testi başarısız oldu; uygulamadan
   sonra geçti. İlk `pnpm verify`, kontrol karakteri regex'inde ESLint
   `no-control-regex` nedeniyle exit 1 verdi; açık karakter denetimiyle düzeltildi.

Son doğrulamada aralıklı test hatası görülmedi. Build, 500 kB üstü renderer chunk
uyarısı verdi. Desktop smoke'taki kapalı sessions-start ve sahte UUID ret logları
beklenen negatif testlerdir; smoke exit kodu 0'dır.

## Gelecekte ayrı onaylanacak gerçek salt okunur görev için zorunlu kapılar

1. Yeni faz ve yeni tek kullanımlık insan onayı: bu offline plan/karar veya R4
   yeniden kullanılmaz. Güvenilir UI/IPC bağlamı, karar verenin kimliği ve tam
   planın gösterildiği kanıtlanır; keyfi renderer root/evidence alanı kabul edilmez.
2. Exact executable + adapter/protocol sürümü + Windows ortamı için uyumluluk
   kanıtı; byte snapshot'ı ve initialize-only başarısı yeterli değildir.
3. Native handle üzerinden son yol, volume/file ID ve bütün reparse tag'leri;
   scope dosyalarını ve executable'ı kullanım anına kadar sabitleme, yarış testleri.
4. Windows üzerinde gerçek dosya ve ağ sandbox negatif testleri: scope dışı
   okuma/yazma, auth/DB/ortak Git metadata erişimi, child process ve ağ kaçışları.
5. Provider tool/approval kanalı: bilinmeyen araç isteği, kanal kopması, sahte/geç
   olay ve kapsam genişlemesi durumunda yeni yan etki başlamadan ret/durdurma.
6. Oturuma özel ayarlar ve global auth/config'e dokunmadan MCP/skill/plugin/hook
   etkinliğinin kapatıldığı doğrulanmalı; ortam allowlist'i ve sır koruması.
7. Gerçek görev launcher'ı için ayrı tasarım/inceleme: süreç ağacı sahipliği,
   başlangıç yarışı, süreli sonlandırma, output drain ve cleanup. Job Object'ın
   dosya/ağ sandbox'ı olmadığı korunur.
8. Geleceğin çalıştırılabilir planı model, tam görev girdisi, argv, oturum
   seçenekleri, ağ/veri çıkışı, sonlu süre/token bütçesi ve bütün ilgili kanıt
   sürümlerini de digest'e bağlamalıdır. Monotonic süre/uyku/clock rollback
   davranışı ayrıca test edilmelidir.
9. Başlatmadan hemen önce bütün kapıları yeniden denetleme, DB'de atomik onay
   tüketimi/sahiplik/outbox, commit sonrası teslim ve belirsiz teslimde fail-closed
   recovery. Offline rezervasyonun gelecekte launcher'a doğrudan bağlanması yasaktır.
10. Ayrı yetkilendirilmiş gerçek read-only smoke, negatif güvenlik sonuçları ve
    insan incelemesi olmadan canlı kapı açılmaz. Bu PR merge edilmez; bu faz hiçbir
    canlı görev yürütmez.

## GitHub CI platform kapsamı düzeltmesi

PR #14'ün ilk GitHub Ubuntu koşusunda `tests/managed-preflight.test.ts` içindeki gerçek dosya kimliği/junction testleri Linux geçici dosya yollarını Windows sürücü-yolu şemasına verdiği için `Unsafe Windows path` ile başarısız oldu. Bu, doğrulanmış Windows üretim çalışma sınırı hakkında bir kanıt değildir. Aynı ilk matriste Windows işi iptal edildi; başarılı sayılmaz.

Düzeltme yalnız test kapsamını ayırır: saf Windows yol şeması reddi testleri bütün işletim sistemlerinde çalışır, gerçek Win32 dosya kimliği/SQLite/bağlantı ve junction fixture grubu yalnız Windows'ta çalışır. Üretim yol doğrulaması, erişim kuralları, canlı görev yasağı ve güvenlik kapıları değiştirilmedi. Başarılı bir GitHub CI sonucu ancak yeni PR head'i için her iki iş de tamamlandıktan sonra raporlanacaktır.

### Windows GitHub runner TEMP kanonik yol düzeltmesi

İkinci PR CI koşusunda Ubuntu başarılıydı, fakat Windows'taki yeni managed-preflight fixture grubu `Path alias rejected` ile başarısız oldu. Yerel Windows geliştirme ortamında aynı testler geçmişti. Hosted Windows runner'ın TEMP yolunun kanonik fiziksel yol ile eşleşmemesi olası neden olarak değerlendirildi. Test fixture kökü artık `realpathSync.native(tmpdir())` üzerinden oluşturuluyor. Bu değişiklik yalnız testlerde yapılmıştır; `inspectPath` yol alias reddi, reparse kontrolleri, onay ve canlı yürütme kilidi değiştirilmemiştir. Yeni CI sonucuna kadar Windows doğrulaması başarılı sayılmaz.
