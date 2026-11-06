# Faz 1C-3E — Profilsiz LPAC native fixture fizibilitesi

Tarih: 6 Kasım 2026 (UTC+04:00). Dal:
`feat/phase-1c-3e-lpac-fixture-feasibility`. Base:
`783f9b4317481bd30fa571cd354ce4fff3fa60bd`.

## Karar: NO-GO

**Bu ortamda güvenli, profilsiz LPAC fixture çalıştırması gösterilemedi.**
Windows'un bunu yapamayacağı sonucuna varılmadı. Belgelenmiş launch bileşenleri
bulunuyor; ancak profilsiz runtime'ın yan etkisiz yaşam döngüsü, gerçek LPAC
kimliğinin bağımsız doğrulanması, loader erişim manifesti ve owner-death cleanup
önkoşulları tamamlanmadı. Önceki fazın 2 GiB boş RAM başlangıç hedefi de ilk
ölçümde sağlanmadı. Sadece RAM'in düzelmesi diğer blokörleri kaldırmaz.

LPAC süreci oluşturulmadı, askıda dahi başlatılmadı. Teslim edilen native araç
**güvenilir, inspect-only önkoşul inceleyicisidir; sandbox fixture değildir**.
Başarılı çıkış kodu sorguların tamamlanması demektir. Çıktısı daima `NO-GO`,
`executionAllowed=false`, `liveExecution=false`; runtime/identity/cleanup
`UNKNOWN`. Üretim launcher'ı ve managed onay/SQLite/identity/recovery kodu değişmedi.
Mevcut ürün kapısındaki `liveExecution="failed"` gösterimi de korunur.

İncelenen temel: [izolasyon kararı](../13-WINDOWS-ISOLATION-DECISION.md),
[güvenlik modeli](../04-SECURITY-MODEL.md), [3C](PHASE-1C-3C.md),
[3D](PHASE-1C-3D.md), native `sandbox-fixture.cc`, `stdio-owner.cc`,
`binding.gyp`, Windows sandbox/containment/native-stdio testleri ve build akışı.
3C privilege-only token'ın yetersizliği ve 3B lease kapsamı LPAC kanıtına çevrilmez.
R1/R2/R3/R4 kanıtlarında değişiklik yoktur.

## API araştırması: belge, yerel gözlem ve çıkarım

Kaynaklar 6 Kasım 2026 tarihinde Microsoft Learn üzerinden okundu. Q&A yanıtları,
özel NT API'leri, tersine mühendislikle seçilmiş enum sayıları veya üçüncü taraf
launch kodu destek sözleşmesi kabul edilmedi.

| Bileşen | Belgelenen | Bu fazda kanıtın sınırı |
|---|---|---|
| `DeriveAppContainerSidFromAppContainerName` | Profil adından SID; Windows 8+, `Userenv.lib`; sonuç `FreeSid` ile bırakılır | Sentetik ad için SID türetme sorgulanır. Profilin varlığı/yokluğu sorgulanmaz; SID başarıyla türetildi diye profilsiz launch doğrulanmaz. [SID API](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-deriveappcontainersidfromappcontainername) |
| `SECURITY_CAPABILITIES` + LPAC opt-out | Microsoft LPAC örneği `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` ve `PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY` / `PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT` kullanır; ardından `CreateProcess` çağırır | Sıfır capability ve opt-out attribute'ları yalnız bellekte hazırlanır. Örneğin profil oluşturma adımını atlamanın yaşam döngüsü garantisi belgede kurulmuş değil. [Başlatma](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) |
| `UpdateProcThreadAttribute` | Security capabilities Windows 8+, job list Windows 10+; değerlerin listeden uzun yaşaması gerekir | Kabul yalnız attribute hazırlığıdır; kernel token, job üyeliği veya loader kanıtı değildir. [Attribute API](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute) |
| Profil oluştur/sil | `CreateAppContainerProfile` kullanıcı/app klasörleri ve registry storage oluşturur. Delete açık handle'larla tam temizleyemeyebilir; başarısızlık sonrası durum belirsizdir | Yarat-sil yolu gereksinimleri ihlal eder; hiçbir profil API mutasyonu çağrılmaz. [Create](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile), [Delete](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-deleteappcontainerprofile) |
| Token sorgusu | `GetTokenInformation` çoğu sınıfta `TOKEN_QUERY` ister. `TokenIsAppContainer`, `TokenAppContainerSid`, `TokenCapabilities` ve elevation sınıfları belgelenmiştir | İnceleyici yalnız kendi primary token'ının elevation/AppContainer değerlerini sorgular. LPAC çocuğu yoktur. [Sorgu](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation) |
| LPAC kimliği | `TokenIsLessPrivilegedAppContainer` enum adı SDK'da ve belgede vardır; belge LPAC anlamını açıklar | İncelenen sayfa bu sınıfın buffer tipi/uzunluğu/değer sözleşmesini açık tanımlamıyor. DWORD varsayımıyla başarılı sorguyu attestation saymadık. Launch attribute'ı veya AAP grup yokluğu tek başına kimlik ispatı sayılmayacak. [Token sınıfları](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-token_information_class) |

Profilsiz aday: yalnız SID türetme + sıfır capability + LPAC opt-out + doğrudan
`CreateProcessW`. Bu bir **araştırma hipotezidir**. Kalıcı profilin zorunlu olduğu
da, bu yolu atlamanın desteklenen ve kalıntısız olduğu da doğrulanmış değildir.
Elle SID üretmek, düşük seviye token API'sine geçmek veya normal AppContainer'a
düşmek bu belirsizliği çözmez. Bu faz böyle fallback eklemez.

## Yetki ve ortam gereksinimleri

İnceleyici yalnız kendi token'ını `TOKEN_QUERY` ile açar, privilege etkinleştirmez,
impersonation yapmaz. Elevated token bilgisi bir gözlemdir; bu araç zaten hiçbir
koşulda launch yapamaz. Gelecek harness elevation veya sorgu belirsizliğinde
başlatmayı reddetmeli; normal kullanıcı bağlamında ayrı doğrulanmalıdır.

Önerilen `CreateProcessW` yolu çağıranın kullanıcı bağlamında çalışır.
`CreateProcessAsUserW` ile bunu karıştırmamak gerekir: bu API tipik olarak
`SeIncreaseQuotaPrivilege`, bazı durumlarda `SeAssignPrimaryTokenPrivilege`
gerektirir; caller'ın restricted primary token'ı için ikinci ayrıcalığa istisna
vardır. Bu istisna profilsiz LPAC runtime kanıtı değildir. 1314 veya erişim
hatasında logon/elevation/unrestricted tekrar yapılmaz.
[Microsoft CreateProcessAsUserW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw).

Gelecek fixture'ın önkoşul manifesti en az şunları içermelidir; bu fazda tamamı
karşılanmış gibi gösterilmez:

- Sabit native EXE hash'i, imza/derleme kaynağı, file ID, local NTFS volume,
  reparse/hard-link denetimi; doğrulanan handle'lar kullanım boyunca açık.
- EXE, her import/delay-load DLL, çalışma dizini ve gerekiyorsa registry nesnesi
  için tam erişim maskesi ve erişim gerekçesi. CRT'yi statik bağlamak Windows
  loader ve sistem DLL erişimlerini ortadan kaldırmaz. DLL arama yolu/cwd/env
  sabitlenmeli; `PATH`, auth, proxy, plugin veya `NODE_OPTIONS` aktarılmamalı.
- Sistem/kurulum/kullanıcı kökü ACL'si değişmeden olumlu okuma ve image execute
  yolu. Ayrı disposable nesnenin *oluşturma anında* package-SID read/execute
  DACL'si olası bir sonraki tasarımdır; bu fazda hiçbir ACL oluşturulmadı/değişmedi.
  Aynı testte dış sentinelin mevcut olduğu ve normal kullanıcı için okunabildiği
  bağımsız kanıtlanmalı. Broker'dan inherited read handle ile veri almak, LPAC'ın
  path üzerinden dosya açabildiğini kanıtlamaz.
- Yazma/delete/rename/replace için DACL yanında parent directory delete-child,
  MIC, mevcut writable handle/mapping ve paylaşım kilidi etkileri ayrılmalı.
  Lease kaynaklı Win32 32, LPAC erişim reddi değildir.
- Profil kaydı, package storage, registry ve diğer OS yan etkileri için kapsamı
  tanımlı salt-okunur before/after gözlemi; normal çıkış, hata, owner ölümü ve
  yarıda kalan hazırlık için cleanup kanıtı. `FreeSid` yalnız bellek temizler.

## Çalıştırılmayan minimal fixture tasarımı

Gelecekte önkoşullar çözüldüğünde tek bir native child ve sabit sentetik içerik
yeterlidir. Node, Codex, shell, Git, provider veya gerçek kullanıcı verisi yoktur.
Uygulama kodu ve EXE/DLL manifesti değiştikçe kanıt yenilenir.

Owner önce özel, miras bırakılmayan job kurar: kill-on-close, breakaway kapalı,
en fazla 3 süreç ve 128 MiB job commit; 5 s çalışma, 2 s bounded cleanup, 10 s
dış watchdog, 4 KiB çıktı. Bunlar önerilen bütçelerdir, LPAC üzerinde ölçülmedi.
`JOB_LIST` launch anında atanmalı; child suspended iken image/token/SID,
sıfır network capability, LPAC kimliği, düşük integrity ve **aynı job** üyeliği
owner tarafından doğrulanmadan resume edilmemeli. Handle allowlist yalnız özel
iletişim uçlarını içermeli; token/job/DB/file-write handle'ı sızmamalı.

Job sahibi yalnız controller olmalı; son handle kapanışı kill-on-close için
kritiktir. Süreç sayısı sıfır olmalı, çıkışlar beklenmeli, kanal drain/close ve
sentinel kimlik/içerik kontrolleri tamamlanmalı. Job'lar doğrudan süreç ağacını
yönetir; WMI/service gibi aracılı yollar ayrı kapsamdır.
[Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Hazırlık, suspended create, doğrulama, resume ve çalışma aşamalarında owner-death
testleri gerekir. Controller ölürken kalan disposable dosyalar için ayrıca
gözlem/cleanup sahibi gerekir; kill-on-close disk temizliği değildir. Güç
kesintisinden sonra kesin disk temizliği iddia edilemez. Belirsiz cleanup yeni
koşuyu engeller; limitsiz retry veya otomatik approval yoktur.

| LPAC kabul deneyi | Bu faz |
|---|---|
| Gerçek AppContainer SID/token ve LPAC kimliği | ÇALIŞTIRILMADI / UNKNOWN |
| Creation-time job üyeliği ve child/grandchild/breakaway | ÇALIŞTIRILMADI / UNKNOWN |
| Yetkili sentetik path okuma ve bağımsız içerik doğrulaması | ÇALIŞTIRILMADI / UNKNOWN |
| Mevcut dış dosya/traversal/junction/hard-link okuma reddi | ÇALIŞTIRILMADI / UNKNOWN |
| Write/delete/rename/replace reddi ve değişmeyen kimlik/içerik | ÇALIŞTIRILMADI / UNKNOWN |
| Kontrollü `127.0.0.1` ve `::1` TCP listener | ÇALIŞTIRILMADI / UNKNOWN |
| Normal sonlanma, timeout, owner-death ve profilesiz kalıntı kontrolü | ÇALIŞTIRILMADI / UNKNOWN |

Loopback tasarımında listener önce bind/listen olmalı, unsandboxed sentetik
olumlu kontrol başarılı olmalı; aynı LPAC/config altında OS ret kodu ve sıfır
kabul edilen bağlantı birlikte doğrulanmalı. Capability veya loopback muafiyeti
eklenmez. IPv6 kullanılamaması `UNKNOWN`/skip'tir, ağ reddi değildir. Dış ağ,
DNS ve proxy deneyi yoktur. Timeout, connection-refused, eksik dosya, loader
çökmesi veya start failure hiçbir tabloda başarılı izolasyon sayılmaz.

## Teslim edilen inceleyicinin güvenlik ve cleanup kapsamı

`apps/worker/native/lpac-preflight.cc` yalnız `--inspect` kabul eder. Bilinmeyen
argümanlar sorgulardan önce exit 2; API hataları ham hata koduyla exit 1 olur.
SID ve attribute list heap'te tutulur; attribute belleği en fazla 64 KiB'dır.
Kaynak sahipliği RAII ile kapanır, attribute değerleri listeden önce bırakılmaz.
Stdout küçük sabit şemadır; caller SID'si, kullanıcı yolları veya env yazılmaz.
5 s timeout/4 KiB output limiti test harness'ındadır. Bu trusted inspector için
LPAC veya job bellek limiti iddiası yoktur; descendant oluşturma kodu yoktur.

Yeni kaynak kodunda profil/dosya/registry/ACL/ağ/servis oluşturan veya child
başlatan doğrudan API çağrısı yok (stdout/stderr raporlaması hariç).
Bu nedenle yeni LPAC staging kökü veya profil için recursive cleanup yapılmaz.
Build çıktıları ignored `native/build` altında kalır; bilinçli geliştirme
artefaktlarıdır. İnceleyici worker dağıtımına kopyalanmaz. Tekrarlı sorgu testi
LPAC owner-death veya OS'nin bütün cache/telemetry yan etkilerinin yokluğu kanıtı
değildir; böyle bir iddia yoktur.

10 yeni test yalnız Windows'ta gerçek executable kullanır. Eksik binary,
loader hatası, nonzero çıkış veya attribute reddi test başarısızlığıdır;
desteklenmeyen API için sessiz skip yoktur. Ubuntu'da 10 test platform skip'i
olur; Windows OS garantileri taklit edilmez. Tam suite eski güvenlik
regresyonlarını da çalıştırır, fakat onları LPAC kanıtı olarak etiketlemez.

## Ortam, ölçümler ve doğrulama

Yerel Windows x64 `10.0.26300`, registry build `26300.9711`, DisplayVersion
`26H2`; registry ProductName eski `Windows 10 Home Single Language` metnini
taşıyor. Bu metin başka Windows sürümünde test yapıldığı anlamına gelmez.
Node `24.20.0`, pnpm `11.25.0`, MSVC 2026 `18.11.12306.390`, SDK `10.0.26100.0`,
Python `3.13.15`. Daha geniş OS/SDK/ARM64/Server matrisi doğrulanmadı.

İlk host snapshot: fiziksel RAM `7,879,585,792` bayt (~7,34 GiB), available
`896,270,336` bayt (~0,83 GiB). 8 GB cihazda ek VM başlatılmadı; 2 GiB boş RAM
hedefinin sağlanmaması yeni LPAC deneyi için ek NO-GO nedenidir. Bunlar anlık
host değerleridir; LPAC peak private bytes, job commit, CPU, startup/kill latency,
paging ve UI gecikmesi **UNKNOWN**. Test suite maliyeti LPAC maliyeti değildir.

22:20:23 başlayan verbose koşuda native gözlem:

```json
{"version":1,"mode":"inspect-only","decision":"NO-GO","executionAllowed":false,"liveExecution":false,"tokenElevated":false,"callerAppContainer":false,"totalPhysicalBytes":7879585792,"availablePhysicalBytes":662736896,"memoryBudgetMet":false,"sidDerived":true,"securityCapabilitiesAttributeError":0,"lpacAttributeError":0,"profilelessRuntime":"UNKNOWN","lpacIdentity":"UNKNOWN","runtimeCleanup":"UNKNOWN"}
```

`lpac_preflight.exe` SHA-256:
`751b9c508b162454e89a3e3b4d01768f5a6f68f7b9b883562becf67a8920f4c7`.
Bu yalnız ölçülen derlemenin provenance bilgisidir; attestation veya başka
binary/OS sürümü için destek kanıtı değildir. İkinci available RAM ölçümü
`662,736,896` bayt (~632 MiB); aynı anda doğrulama araçları çalışıyordu.
Release MSBuild hedefi SDK `10.0.26100.0`, CRT `MultiThreaded` kullanıyor;
bu trusted inceleyicinin import'ları LPAC loader uyumluluk manifesti değildir.
`dumpbin /imports` incelemesi KERNEL32, ADVAPI32 ve USERENV doğrudan import'larını
gösterdi; USERENV'den yalnız SID türetme var. CRT'nin `CreateFileW`, `WriteFile`,
`LoadLibraryExW` gibi import'ları da mevcut: kaynakta bu işlemlerin olmaması
runtime'ın hiç dosya açmadığını göstermez. Import tablosu transitif DLL yükleme
veya OS yan etkileri için izleme kanıtı değildir.

| Komut | Gerçek yerel sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; 224 paket reused, downloaded 0; lockfile değişmedi |
| `pnpm verify` | exit 0; lint/typecheck/build başarılı; **29 dosya, 357 geçti / 1 skip**, test süresi 60.37 s |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock, UI/CSP, ConPTY ve nested-tree cleanup geçti; provider version probe kapalı |
| `pnpm audit --prod` | exit 0; bilinen güvenlik açığı bulunmadı |
| `pnpm exec vitest run tests/lpac-preflight.test.ts tests/native-path-boundary.test.ts --reporter=verbose --silent=false` | izinli tekrarda exit 0; **28 geçti / 1 skip**, 3.76 s; yeni grup **10/10**, mevcut grup **18 geçti / 1 skip** |
| `git diff --check` | exit 0 |
| `pnpm exec prettier --check tests/lpac-preflight.test.ts` | izinli tekrarda exit 0 |

### Hatalar, skip'ler, tekrarlar ve sınırlar

1. İlk yeni test koşusu (22:16:11) **10 başarısız**: executable henüz yoktu;
   ayrıca `it.each` argüman dizisini kolonlara açtığı için altı negatif senaryo
   yanlış argüman tipiyle durdu. Tablo object satırlarına çevrildi.
2. İkinci yeni test koşusu (22:16:26) **10 başarısız**: artık tüm senaryolar
   eksik binary/`ENOENT` veya bulunmayan build assertion'ıyla durdu. Bunlar
   izolasyon ret kanıtı değildir. Native kod/build eklendikten sonra full suite
   ve ayrı verbose koşu geçti. Native derleme veya runtime hatası yaşanmadı.
3. Verbose ek koşunun ilk denemesi `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`,
   kullanıcı pnpm store lock'una erişim reddiyle testleri başlatamadı. Ardından
   gelen hash/diff komutları başarılı olduğu için birleşik shell exit'i 0 idi;
   bu test başarısı sayılmadı. Tek test komutu sandbox dışı normal kullanıcı
   bağlamında tekrarlandı; native `tokenElevated=false` gözlendi. Yönetici
   yükseltmesi/privilege değiştirme yapılmadı.
4. Full-suite ve verbose koşudaki tek gerçek skip:
   `rejects a symlink without following its target`, Windows file symlink
   oluşturma `EPERM`. Yetki değiştirilmedi. Junction ve diğer mevcut native
   testler çalıştı; yeni 10 testte yerel skip yoktur.
5. Build mevcut renderer >500 kB chunk uyarısını verdi. Desktop smoke
   `Downloading Electron binary...` yazdı; kapalı sessions-start ve geçersiz
   approval UUID logları beklenen negatif kontrollerdi. Bunlar fixture ağı
   veya gerçek provider çalışması değildir.
6. Keşifte bulunmayan `vitest.config.ts` okunmaya çalışıldı; dosya yoktu.
   İlk token enum belge URL'si yanlış header (`securitybaseapi`) altında açıldı
   ve web aracı erişim hatası verdi; doğru `winnt` belgesi okundu. Bunlar
   ürün hatası değildir.
7. Son Prettier kontrolü de ilk denemede aynı pnpm store lock erişim reddiyle
   başlamadı; tek komut olarak izinli tekrar exit 0 verdi. İlk birleşik shell
   komutunun sonundaki diff başarısı Prettier başarısı sayılmadı.
8. İlk `git add`, sandbox'ın `.git/index.lock` yazma reddiyle durdu; yalnız
   beş teslim dosyasının stage edilmesi için normal kullanıcı izni istendi.

Install/verify/desktop/audit için başarısız tam koşu veya tekrar gerekmedi.
Yeni testler Windows API sorgularını doğrular; atlanan LPAC kabul matrisi bu
10 testin içinde başarı veya Vitest skip olarak sayılmaz. LPAC deneyi hiç
uygulanmadı/başlatılmadı. Ubuntu çalıştırması yerel Windows sonuçlarından
çıkarılamaz; mevcut CI matrisi değişmedi.

Doküman araştırması, dependency/audit sorguları ve istenen GitHub teslimi
harici ağ kullanabilir; native inceleyicinin ağ kodu yoktur. Yeni profil,
firewall/ACL/loopback değişikliği, background service, credential erişimi,
provider görevi veya otomatik onay yapılmadı. Önceden bulunan `.serena/`
dizini teslim kapsamı dışında tutuldu.

## Kalan güvenlik blokörleri

Profilsiz destek/kalıntı sözleşmesi, LPAC token doğrulaması, runtime erişim
manifesti ve owner-death cleanup çözülmeden fixture çalıştırılmaz. Daha sonra
dosya/ağ/IPC/çocuk sınırları, broker framing/handle güvenliği, provider tool
delegation/auth ayrımı ve gerçek insan onayı ayrıca doğrulanmalıdır. Bu rapor
üretim sandbox'ı, provider uyumluluğu veya canlı managed yürütme izni değildir.
