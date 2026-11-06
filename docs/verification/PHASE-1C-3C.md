# Faz 1C-3C — Windows sandbox negatif kanıt temeli

Tarih: 6 Kasım 2026. Dal: `feat/phase-1c-3c-windows-sandbox-evidence`.
Başlangıç: `0b584111990e177739f069f4800c0b473fa0ef8e` (PR #15).
Yerel ortam: Windows x64 `10.0.26300`, Node `24.20.0`, pnpm `11.25.0`,
MSVC Build Tools 2026, Windows SDK 10.0.26100.

## Sonuç ve kapsam

**Çalıştırılabilir bir managed-task sandbox doğrulanmadı.** Bu teslim, gerçek
Win32 fixture süreçleriyle mevcut adayın yetersizliğini ölçen bir negatif kontrol
temelidir. `filesystem`, `network`, `childIsolation` yalnız `UNKNOWN`;
`executionAllowed=false`, `liveExecution=false`. Mevcut managed preflight'ın
`liveExecution=failed` kapısı ve koşulsuz `authorizeExecution` reddi değişmedi.

Mimari, 1C-3A/3B raporları, native stdio süreç sahipliği ve native path lease
incelendi. Üretim launcher'ı, native kimlik denetimleri, katı planlar, immutable
approval digest'leri, SQLite tek-yazıcı/sahiplik/recovery kodu değiştirilmedi.
R1/R2/R3/R4 kanıtlarına dokunulmadı. Yeni IPC, renderer onayı, provider/model
görevi, Codex app-server veya otomatik onay yolu yoktur.

## Mekanizmaların değerlendirilmesi

| Mekanizma | Dayanak ve bu fazdaki karar |
|---|---|
| Job Object | Süreç grubu, kaynak sınırı ve kill-on-close sağlar; güvenlik kısıtları ayrıca gerekir. Dosya/ağ allowlist'i değildir. Fixture'da kullanıldı. [Microsoft](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects) |
| Restricted token | Privilege kaldırma, deny-only SID ve restricting SID ayrı mekanizmalardır. Bu fazın tekrarlanabilir adayı yalnız `DISABLE_MAX_PRIVILEGE` kullanır; sıradan kullanıcı erişimini sınırlandırdığı iddia edilmez. [API](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken) |
| Restricting SID | İlk deneyde current-user restricting SID eklenmesi probe başlamadan `0xC0000022` verdi. Başlangıç engeli dosya izolasyonu kanıtı değildir; çalışır aday olarak teslim edilmedi. Herhangi bir sistem ACL'si açılmadı. [Token erişim semantiği](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens) |
| Low integrity / MIC | Varsayılan no-write-up, workspace dışı okumayı veya ağı tek başına sınırlamaz. Bu fazda uygulanmadı, UNKNOWN. [Microsoft MIC](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control) |
| AppContainer | Windows 8 ile gelen token/capability tabanlı izolasyon adayı. Okuma erişimi yazmadan farklıdır; salt API varlığı strict workspace sınırını kanıtlamaz. Profile yaşam döngüsü, ACL/capability, runtime yükleme, handle aktarımı ve loopback muafiyetleri için ayrı deney gerekir. Bu fazda başlatılmadı, UNKNOWN. [Başlatma](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer), [izolasyon](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation) |
| Windows Sandbox VM | Windows 10 1903+ / Windows 11 için belgelenir; sanallaştırma, en az 4 GB RAM, 1 GB disk ve iki çekirdek gerekir. Özelliği etkinleştirme yönetici/sistem değişikliği gerektirebilir; bu görevde kurulmadı/başlatılmadı. Varsayılan ağ açıktır; read-only mapped folder ve networking disable ayarlarının varlığı bizim execution zincirimizin doğrulaması değildir. [Kurulum](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install), [yapılandırma](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file) |

Tercih: var olan üretim launcher'ını genişletmek veya yönetici gerektiren VM
kurmak yerine ayrı test executable'ı. Bu karar yalnız negatif kanıt toplar;
gelecekteki güvenli launcher seçimini kapatmaz.

## Sürümlü sözleşme ve kanıt güveni

`packages/contracts/src/windows-sandbox.ts`: strict Zod sözleşmesi, sürüm `1`,
mekanizma `restricted-token-job-v1`. OS release, mimari, fixture executable
SHA-256, toplama zamanı, senaryo, native lease bağlamı ve ham Win32 hata kodu
kaydeder. Üst nesne, capability nesnesi, gözlem dizisi ve gözlemler readonly'dir.
`ALLOWED` yalnız kod 0; `DENIED` yalnız 5/32; diğer nonzero sonuçlar `ERROR`.
Dosya yokluğu, bağlantı reddi veya süreç başlangıç hatası sandbox başarısı değildir.

V1 hiçbir `VERIFIED` değeri ifade edemez. Yeni bir doğrulayıcı için ayrı incelenmiş
sözleşme sürümü gerekir. JSON şemasından geçmek OS kanıtının otantik olduğu
anlamına gelmez; bu raporlar tanılama içindir ve onay/çalıştırma girdisi değildir.
Hash provenance bilgisidir, imza veya hostile-process attestation değildir.

Native controller çocuk başlamadan Job Object atar (`PROC_THREAD_ATTRIBUTE_JOB_LIST`),
askıda oluşturur, **kendi job üyeliğini**, token'ın `TokenHasRestrictions` değerini
ve privilege listesini sorgular. `SeChangeNotifyPrivilege` dışında privilege
kalmamış olmalıdır. Çocuk da token/job kontrolü yapar. Sadece başlatma başarısı
işlem sonucu sayılmaz: probe sonuç kodları ayrı aralıkta taşınır; crash/loader
status'ü observation'a çevrilmeden test başarısız olur. Her koşu sonunda job
sonlandırılır ve `ActiveProcesses=0` sorgulanır.

## Kontrollü fixture'lar ve ölçülen sınırlar

Testler kanonik TEMP altında benzersiz `ak-sandbox-*` kökü oluşturur. `workspace`
tek onaylı test çalışma alanı; `outside` aynı disposable kökün sentetik kardeşidir.
Gerçek özel dosya, credential veya kullanıcı verisi hedeflenmez. Dosya işlemleri
sabit isimlidir; keyfi executable/komut/yol/host kabul edilmez. Shell kullanılmaz.
Child executable test build çıktısıdır, `worker/dist` içine kopyalanmaz.

| Deneme | Ölçülen negatif kontrol sonucu |
|---|---|
| Onaylı dosya okuma | ALLOWED; çalışabilen olumlu kontrol |
| Workspace dışı mutlak yol, `..` traversal, junction reparse | ALLOWED; kapsam sınırı kurulmamış |
| Çocuk süreçten workspace dışı okuma | ALLOWED; job üyeliği dosya izolasyonu sağlamıyor |
| Yazma, silme, rename, replace; native lease yok | ALLOWED; dosya içeriği/varlığı ayrıca denetlenir |
| Aynı dört işlem, native lease açık | DENIED, Win32 32 (`ERROR_SHARING_VIOLATION`); içerik ve volume/file identity korunur |
| Lease kapandıktan sonra aynı işlemler | ALLOWED; lease yaşam süresi dışı sandbox iddiası yok |
| `CREATE_BREAKAWAY_FROM_JOB` ile doğrudan çocuk | DENIED, Win32 5 (`ERROR_ACCESS_DENIED`); tüm broker/IPC kaçışlarının engellendiği iddiası yok |
| Kontrollü `127.0.0.1` TCP listener | ALLOWED; listener tam bir bağlantı görür, ağ izolasyonu kurulmamış |

Network hedefi native kodda sayısal `INADDR_LOOPBACK` sabitidir. Port testin kendi
dinleyicisinden alınır; DNS, proxy, harici host veya internet test paketi yoktur.
Araştırma, dependency kurulumu ve istenen audit sorgusu fixture trafiği değildir.

## Destek, izinler ve kaynak sınırları

Test temeli kapsamı Windows 11 x64, yerel NTFS, Node 24 ve mevcut MSVC/SDK'dır.
Yalnız yukarıdaki build yerelde ölçülmüştür; bütün Windows 11 sürümleri,
Windows 10/Server, ARM64 veya ağ volume'leri için doğrulama iddiası yoktur.
Hiçbir Windows sürümünde managed sandbox execution desteği açılmaz.

Normal kullanıcı token'ından restricted primary token oluşturulur; yönetici
yükseltmesi, privilege etkinleştirme, firewall, global policy veya ACL değişikliği
yapılmaz. `CreateProcessAsUserW`, Job List veya nested job kısıtı yüzünden
başlatılamazsa koşu başarısızdır; unrestricted fallback yoktur.

Job için en fazla 3 aktif süreç ve 128 MiB job commit limiti ayarlanır;
breakaway izni verilmez. Bunların stres altında etkinliği bu fazda ölçülmedi.
Native ana probe beklemesi 5 s, child/loopback beklemesi 2 s, cleanup beklemesi
2 s; Node dış timeout 10 s, çıktı sınırı 4 KiB. Bunlar duvar saati watchdog'larıdır,
CPU oran kotası değildir. Handle'lar miras bırakılmaz; job sahibi controller'dır.
Test environment yalnız SystemRoot taşır. Temizlik yalnız oluşturulan fixture
köküne uygulanır; junction hedefi aynı kökün içindedir.

## Kalan riskler ve çalıştırılmayan kapsam

- Dosya ve ağ izolasyonu açıkça yetersizdir. Bir uygulama path check'i veya
  read-only niyeti yetki azaltmaz. Disk dışı namespace, registry, IPC/COM/WMI
  broker'ları, servis üzerinden süreç oluşturma ve masaüstü mesajlaşması sınanmadı.
- Native lease inceleme süresini korur; önceden açılmış writable handle/mapping,
  yarışlar, çok dosyalı atomiklik, kernel/filter driver ve aynı kullanıcı saldırısı
  için sandbox kanıtı değildir. Yeni fixture gerçek saldırgan kod modeli değildir.
- IPv6, UDP, DNS, named pipe üzerinden proxy ve tüm alternatif ağ yolları
  çalıştırılmadı. IPv4 başarısı zaten adayın offline garantisini çürütür.
- AppContainer/LPAC, VM, low integrity, ACL tabanlı read-only alan ve restricting
  SID ile çalışır runtime başlatma henüz kanıtlanmadı. Bunlar UNKNOWN blokörlerdir.
- Yeni reparse testi junction'dır. Arbitrary reparse tag ve file symlink kapsamı
  mevcut 1C-3B regresyonlarına aittir; symlink izin skip'i sandbox kanıtı sayılmaz.
- Ubuntu'da yeni Windows native test grubu açıkça skip edilir. Saf sözleşme
  testleri çalışır; Linux üzerinde Windows doğrulaması simüle edilmez.
- Gelecekte VERIFIED için aynı policy/token/config altında olumlu okuma kontrolü,
  tüm yasak işlemlerde gerçek OS reddi, bağımsız sonuç/kimlik doğrulaması, süreç
  ağacı ve failure/owner-death kanıtı, ağ kapsamı ve sürüm matrisi gerekir.
  Bunun ardından bile insan onayı, tool gate ve provider uyumluluğu ayrı kapılardır.

## Doğrulama sonuçları

| Komut | Gerçek yerel sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; lockfile değişmedi |
| `pnpm verify` | exit 0; lint, typecheck, build başarılı; 27 test dosyası, **321 geçti / 1 skip**, 58.34 s |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock, CSP, Türkçe UI, responsive görünüm, ConPTY ve nested-tree cleanup geçti; sessions-start kapalı |
| `pnpm audit --prod` | exit 0; bilinen güvenlik açığı bulunmadı |
| `pnpm exec vitest run tests/windows-sandbox-contract.test.ts tests/windows-sandbox.test.ts --silent=false --reporter=verbose` | exit 0; **19/19 geçti**, 2.83 s; 3 saf sözleşme + 16 Windows testi |

Tek gerçek full-suite skip: mevcut `rejects a symlink without following its
target`; hesap file symlink oluşturamıyor (`EPERM`). Yalnız bu testi seçen
teşhis koşusunda 1 aynı gerekçeli skip + filtre nedeniyle 18 seçilmemiş test vardı;
bu koşu 19 başarılı test değildir. Yeni Windows grubunda yerelde skip yoktur.
Ubuntu'da 16 yeni Windows testi skip olacak; 3 saf sözleşme testi çalışacaktır.
Yerel sonuç Ubuntu doğrulaması değildir; PR CI matrisi ayrıca izlenir.

Verbose kanıt koşusu: 2026-11-06 21:37 (+04:00), gözlem zaman aralığı
`1793986624826..1793986626265` ms. Fixture SHA-256:
`f3407db77958e55d5e4037577b235aeaa66d03f91f9fe319c6a70cbd73f77c94`.
Tüm ALLOWED sonuçlarının Win32 kodu 0; dört lease reddi 32, direct breakaway
reddi 5. Her başarılı testte token azaltımı, job üyeliği ve cleanup doğrulandı.
Bu hash yalnız o derlemenin çıktısıdır; yeniden build aynı hash'i garanti etmez.

Mevcut renderer >500 kB chunk uyarısı devam ediyor. Desktop smoke'daki kapalı
session-start ve sahte approval UUID ret logları beklenen negatif testlerdir.

İlk denemeler: eksik sözleşme nedeniyle RED import hatası; native build öncesi
15 test başarısız/2 geçti. İlk SID kısıtlı adayda 15 test başarısız oldu; normal
kullanıcı ortamındaki tekrar da aynı loader status'ünü verdi. Privilege-only
adaya geçişte Unicode privilege adı derleme hatası düzeltildi; incremental MSVC
`LNK1103` çıktısı temiz `pnpm build` ile giderildi. İlk build ayrıca pnpm store
kilidi erişiminde durdu; izinli tekrar yapıldı. Hiçbiri sandbox başarısı sayılmadı.
