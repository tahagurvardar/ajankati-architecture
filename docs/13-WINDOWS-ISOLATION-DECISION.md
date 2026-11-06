# Faz 1C-3D — Windows izolasyonu mimari kararı

Tarih: 6 Kasım 2026. Başlangıç: `27f0876f8942e667329bbadd2c3728637375da0b`
(PR #16). Durum: **tasarım adayı; managed yürütme için NO-GO**.

Takip: [1C-3E profilsiz LPAC fizibilitesi](verification/PHASE-1C-3E.md),
SID/attribute hazırlığını gerçek Windows API'leriyle salt-okunur sorgular.
Profilsiz runtime, LPAC kimliği ve cleanup önkoşulları doğrulanamadığından
LPAC fixture başlatılmadı; NO-GO ve kapalı yürütme kapıları korunur.

## Karar

8 GB Windows 11 hedefi için öneri: **worker'ın sahip olduğu dar yetki broker'ı,
ağsız LPAC araç süreci ve ayrı güvenilir provider bağlantı katmanı**. LPAC,
AppContainer'ın daha dar başlangıç erişimi nedeniyle tercih edilen araştırma
adayıdır; ürün desteği veya kanıtlanmış sandbox değildir. Bir sonraki faz önce
profilsiz native fixture başlatma/temizlik yolunu kanıtlamalıdır. Bu mümkün
olmazsa otomatik olarak normal AppContainer'a veya restricted token'a düşülmez.

Codex'in bütün araç etkilerini dış yürütücüye yönlendirebildiği ve doğrudan
shell/dosya/MCP etkilerinin kapatılabildiği **UNKNOWN**. Bu koşul sağlanmazsa
önerilen ayrım uygulanamaz ve managed mod kapalı kalır. Auth sorunu çözülmüş gibi
Codex'i tam kullanıcı yetkisiyle çalıştırıp yalnız çocuklarına sandbox etiketi
vermek kabul edilmez. Tüm Codex runtime'ını LPAC içine koymak ayrı uyumluluk
araştırmasıdır; bu faz onu çalıştırmaz.

Windows Sandbox veya yönetilen Hyper-V VM, daha güçlü kernel ayrımı gerektiğinde
ayrı kurulum/onay ve kaynak bütçesi isteyen alternatif ürün yolu olabilir.
Bu makinede kurulmadı, etkinleştirilmedi veya başlatılmadı. 8 GB cihazda varsayılan
VM seçilmedi; bu performans ölçümü değil, kurulum ve bellek maliyetine dayalı
mühendislik tercihidir. Hiçbir seçenek bugün canlı yürütmeye izin vermez.

## İncelenen mevcut temeller

- [Güvenlik modeli](04-SECURITY-MODEL.md): worker güvenilir, renderer ve ajan
  çıktıları güvenilmez; auth sahibi CLI; aynı kullanıcıya ait DB/pipe/worktree
  tek başına saldırgan sürece karşı sınır değildir.
- [1C-3A](verification/PHASE-1C-3A.md), `managed-preflight.ts` ve storage
  `managed-task.ts`: digest'e bağlı tek kullanımlık offline inceleme kararı,
  `BEGIN IMMEDIATE` içinde tüketim/sahiplik, recovery'de interrupted, otomatik
  replay veya ownership bırakma yok. `authorizeExecution` daima reddeder.
- [1C-3B](verification/PHASE-1C-3B.md), `native-path-boundary.ts` ve
  `path-boundary.cc`: native handle ile final path, volume/file ID, reparse/tag,
  hard link ve paylaşım denetimi. Lease yalnız callback süresince açık;
  snapshot gelecekteki dosya açılışını yetkilendiren handle değildir.
- `stdio-owner.cc` ve `native-stdio.ts`: doğrulanmış image, creation-time job
  list, yalnız üç stdio handle'ı, suspended başlatma/üyelik kontrolü, dar env,
  timeout/backpressure ve cleanup. Temizliği bilinmeyen durum başarı sayılmaz.
  Bunlar AppContainer token'ı oluşturmuyor. Mevcut launcher değiştirilmedi.
- [1C-3C](verification/PHASE-1C-3C.md): privilege-only restricted token altında
  dış okuma, junction, yazma ve IPv4 loopback ALLOWED; doğrudan breakaway DENIED;
  açık lease sırasında yazma Win32 32. Bunlar yalnız ilgili fixture kanıtıdır.
  R1/R2/R3/R4 yeniden tüketilmedi veya değiştirilmedi.

## Mekanizma karşılaştırması

| Aday | Kazanç | Eksik / maliyet | Karar |
|---|---|---|---|
| Restricted token + Job | Privilege azaltma, süreç sahipliği/sonlandırma | 3C adayı dosya/ağ sınırı sağlamıyor; restricting SID sürümü loader'da başarısızdı | Tek başına reddedildi |
| AppContainer | Package/capability erişim denetimi, ağ ve nesne sınırları | Yaygın AppContainer erişimli kaynaklar strict workspace allowlist'i değildir; runtime ve auth uyumu UNKNOWN | Karşılaştırmalı fixture adayı |
| LPAC + Job + broker | ALL APPLICATION PACKAGES erişiminden çıkış; daha küçük başlangıç yetkisi | Runtime DLL/registry/COM gereksinimleri ve profil yaşam döngüsü UNKNOWN; aynı kernel | Önerilen araç yürütme adayı |
| Windows Sandbox | Ayrı kernel, disposable guest | Özellik/virtualization gereksinimi; varsayılan ağ/clipboard; otomasyon, auth ve output aktarımı ayrıca tasarlanmalı | Bu fazda çalıştırılmadı |
| Küçük Hyper-V VM | Ayrı guest kernel; imaj, disk ve vNIC kontrolü | Kurulum, image bakım/lisans, boot, RAM, güvenli host-guest kanal maliyeti | Ayrı ürün yolu; otomatik fallback yok |

Restricted token'da privilege kaldırma, deny-only SID ve restricting SID farklı
işlemlerdir; SID kısıtlaması çift erişim kontrolü uygular.
[Microsoft restricted tokens](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens).
Job nesnesi süreç grubu/kaynak ömrünü yönetir; servis/WMI üzerinden başlatma gibi
yollar doğrudan çocuk üyeliği varsayımına sığmaz.
[Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

AppContainer erişimi kullanıcı ve package/capability haklarının kesişimidir.
LPAC ayrıca All Application Packages erişiminden çıkar; bazı registry/COM
erişimleri ayrı capability ister. Bunların varlığı AjanKati uyumluluğunu kanıtlamaz.
[Microsoft başlatma modeli](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer).
AppContainer'ın okuma sınırı yazma sınırından farklıdır; mevcut kullanıcı
credential'larının kullanılabilir olduğunu varsayamayız.
[Microsoft izolasyon modeli](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation).

Windows Sandbox için Microsoft en az 4 GB, önerilen 8 GB RAM ve virtualization
gerektirir. Bu sayı host üzerinde Electron, IDE ve Codex ile rahat çalışma
garantisi değildir. [Kurulum gereksinimleri](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install).
Varsayılan ağ ve clipboard açıktır; gelecekteki deneyde kapatılmalı, host
paylaşımı en fazla açık seçilmiş read-only staging olmalıdır.
[Sandbox yapılandırması](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file).
Hyper-V donanım sanallaştırması ayrı guest işletim sistemleri sağlar;
"hafif VM" bu projede ölçülmüş bir RAM/latency değeri değildir.
[Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/overview?pivots=windows).
WSL dağıtımı veya sıradan container etiketi Windows Win32 izolasyon kanıtı yerine geçmez.

## Sınırlar ayrı ayrı

| Sınır | Önerilen kontrol | Bu fazın durumu / kalan saldırı yüzeyi |
|---|---|---|
| Dosya okuma | Broker'da onaylı handle'dan bounded read; LPAC'a host root verilmez | OS izolasyonu UNKNOWN; sistem runtime dosyaları ayrıca istisna manifesti ister |
| Yazma | İlk aşama hiçbir host yazma yetkisi yok; yalnız disposable scratch | UNKNOWN; sonraki patch export insan incelemesi ve yeni digest/onay ister |
| Reparse/hard link | Kaynak ve staging'de native kimlik/tag kontrolü, handle yaşam boyu açık | 3B inceleme kanıtı mevcut; uzun ömürlü broker okuması, mapping ve yarışlar UNKNOWN |
| Ağ | Araç LPAC'ında network capability ve loopback muafiyeti yok | IPv4/IPv6/UDP/DNS/proxy ve mevcut muafiyet etkileri UNKNOWN; endpoint allowlist ayrıca gerekir |
| Süreç | Suspended create, job'a atomik bağlama, token doğrulama, handle allowlist | Yeni LPAC zinciri UNKNOWN; mevcut stdio sahibinin garantisi otomatik taşınmaz |
| Çocuk süreç | Aynı LPAC/job; breakaway yok; aktif süreç/memory/time sınırı | COM/WMI/service/IPC aracılı kaçışlar UNKNOWN; doğrudan breakaway testi yeterli değil |
| IPC | Worker'ın oluşturduğu kapalı stdio/anonim kanal, run bağlamı worker'dan | Named pipe/ALPC/COM/shared memory erişim reddi UNKNOWN; payload kimliği güvenilmez |
| Kimlik | Her run ayrı bağlam; process handle, token SID, image hash ve adapter sürümü | PID, package SID veya JSON hash tek başına attestation değil |
| Credential | Araç tarafında sıfır sır; auth yalnız güvenilir provider bileşeninde | Provider ayrımı ve auth akışı UNKNOWN; kullanıcı auth dizinine ACL grant/kopya yok |
| DB/onay | Yalnız worker Store yazarı; aynı SQLite ledger/recovery | Sandbox'a DB/WAL/SHM, approval pipe veya GUI token aktarımı yok; OS reddi hâlâ UNKNOWN |

LPAC kernel açığına, yöneticiye veya ele geçirilmiş trusted worker'a karşı VM
sınırı değildir. Aynı kullanıcıya ait dış bir saldırganın worker/DB'ye müdahalesi
mevcut tehdit modelinin sınırlamasıdır; bu rapor onu çözüldü saymaz.

## Node, Codex ve auth uyumluluğu

Node 24'ün bu projede çalışması LPAC altında çalıştığını göstermez. Sıradaki
offline deney ayrı sabit Node binary hash'i ile yalnız sentetik script çalıştırmalı:
loader/DLL, builtin modüller, V8 bellek/JIT, thread, stdio, bounded temp,
aynı token altında çocuk Node. Native addon, Git, shell, paket kurulum ve hook
gereksinimleri ayrı incelenmeli; "başladı" sonucu tüm runtime uyumu değildir.
Genel `registryRead`, `lpacCom` veya geniş dosya capability'si deneme-yanılma ile
açılmaz. Her gereksinim nesne, erişim türü ve gerekçeyle manifestte yer alır.

Mevcut Codex image/protocol incelemesi initialize-only R4'tür; görev, tool
delegation veya LPAC auth kanıtı değildir. Bu faz gerçek Codex app-server,
`--version` probe'u, login veya provider task çalıştırmaz. Codex'in kendi sandbox
modu da aynı sürüm/konfigürasyon altında bağımsız kanıt olmadan kabul edilmez.

Auth seçenekleri ve karar:

1. Global auth/config klasörünü mount etmek veya okumak/kopyalamak: reddedildi.
2. LPAC içinde kullanıcı tarafından ayrı login: browser callback/loopback,
   credential store/DPAPI, refresh ve logout uyumu UNKNOWN; bu fazda denenmez.
3. Önerilen ayrım: provider'ın resmi desteklediği araç devir protokolü varsa,
   güvenilir provider bağlantı bileşeni auth sahibi olur. AjanKati anahtarı okumaz,
   TLS'i açmaz, auth proxy'si olmaz. Araç LPAC'ına credential/environment aktarılmaz.
   Provider bileşeni untrusted shell/plugin yürütmemelidir. Bunun doğrulanması
   zorunlu blokördür; desteklenmiyorsa bu mimariyle managed Codex NO-GO'dur.

Dolayısıyla "auth bozulmadan AppContainer/LPAC'ta Node + Codex çalışır" yanıtı
bugün **UNKNOWN**. Mimari seçim bu sorunu çözmüş olma iddiası taşımıyor.

## Minimal worker broker tasarımı

```text
Güvenilir insan kanalı -> worker [Store + policy + approvals + owner]
                             |                  |
                 provider bağlantısı      bounded özel kanal
                 (auth kendi sahibi)            |
                                         ağsız LPAC + Job
                                         (sentetik/gelecek araç)
```

Broker ayrı genel amaçlı servis değildir; worker'ın native owner yaşam döngüsüne
bağlıdır. Renderer yeni root, SID, process, executable veya grant gönderemez.
Worker güvenilir plan kaydından `runId`, `actionDigest`, policy sürümü, süre,
byte kotası ve opaque resource ID -> açık native handle eşlemesini kurar.
İlk yetki yalnız `read-resource`; `write`, `spawn`, `connect`, `open-pipe`,
credential, Git ve extension işlemleri protokolde yoktur. Gerçek süreç başlatma
broker isteminden değil worker'ın ayrı onaylanmış lifecycle kararından doğar.

Kanalı worker kurar; inherited handle list dışında DB, job/process yönetim,
token veya kullanıcı pipe handle'ı çocuğa geçmez.
[Creation attributes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
Gerekirse named pipe DACL'si ve erişim bitleri açık tanımlanmalı; varsayılan DACL
ve genel write hakları güvenli varsayılmaz.
[Named pipe güvenliği](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights).
Payload'daki run/actor/channel beyanı taşıma kimliği değildir. Child'ın bütün
descendant'ları aynı grant sınırında kabul edilir; sandbox içi kimlik ayrımı iddia edilmez.

Sıra: güvenilir onayı doğrula -> native handle'ları sabitle -> aynı SQLite
transaction'ında yürütmeye özel yeni onayı tüket/ownership/outbox kaydet ->
child'ı suspended oluştur -> token/job/image/channel doğrula -> resume.
Başlatma başarısız veya teslim belirsizse yeniden onay üretme/replay yok.
3A'nın offline tüketimi bu akışa bağlanamaz; yeni şema ve migration incelemesi gerekir.

Her mesaj strict sürüm/alan kontrolü, kanal eşleşmesi, tam digest/run, monoton
sequence, expiry ve toplam kota kontrolünden geçer. Çerçeve sınırı 256 KiB,
gövde sınırı 64 KiB; framing/stream uygulaması ayrıca gerekir. Dosya yolu kabul
edilmez; okuma doğrulanmış aynı handle üzerinden yapılır. Token'ı veya PID'yi
yalnız istemci çıktısından doğrulamak yasaktır. Ağ ileride gerekiyorsa araç
sürecine internet capability vermek yerine ayrı incelenmiş hedef/metot/byte
sınırlı kanal gerekir; provider endpoint değişimi ve veri çıkışı yeni onay ister.

Worker ölümü/kanal kopması/timeout: yeni istekler reddedilir, job kapatılır,
ActiveProcesses=0 ve çıktı drain kanıtı beklenir. Cleanup bilinmiyorsa sahiplik
korunur, interrupted durumu kalır. Restart grant, quota ve approval'ı sıfırlayıp
otomatik devam edemez. Loglarda içerik/env/sır yok; yalnız sonuç kodları ve kimlikler.

## Güvenli deney kararı ve uygulanan model

`CreateAppContainerProfile` kullanıcı/app profili oluşturur; yarat-sil happy path
çökme veya güç kesintisi sonrası cleanup garantisi değildir.
[Profile API](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile).
`DeriveAppContainerSidFromAppContainerName` SID elde etme API'sidir; tek başına
profilsiz runtime veya yazısız OS yaşam döngüsü kanıtı değildir.
[SID API](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-deriveappcontainersidfromappcontainername).
Profilsiz SID + SECURITY_CAPABILITIES + LPAC opt-out yolu gelecekte incelenebilir;
"mutlaka kalıcı profil gerekir" sonucu çıkarılmadı.

Bu depoda profilsiz launch, runtime erişimi ve owner-death temizliğini kanıtlayan
harness yok. Güvenli bootstrap/cleanup ön koşulları kurulmadan profil oluşturmak,
ACL genişletmek veya sınırsız fallback kullanmak yerine **AppContainer/LPAC native
deneyi çalıştırılmadı**. Bu araştırma kısıtıdır, Windows'un yapamayacağı iddiası değil.
Global firewall/ACL/config/loopback exemption değişmedi; yönetici yükseltmesi yok.

Uygulanan `scripts/isolation-broker-model.ts` yalnız in-memory tasarım deneyidir.
Dosya/process/network/credential I/O, IPC server, DB, provider veya ürün import'u
yoktur. Testin verdiği sentetik grant ve kanal güvenilir varsayılır. Sonuç
`MODEL_ACCEPT` olsa bile `executionAllowed=false`. Model strict read-resource
isteklerini, run/digest/kanal bağını, sıralamayı, kota tüketimini, expiry/clock
rollback ve kapatmayı sınar; gerçek onay veya Windows güvenlik kapısı değildir.
Restart/persistence, gerçek monotonic saat, mesaj boyutu/framing, kernel token
kimliği, handle okuma, IPC saldırısı veya cleanup kanıtlamaz.

| Negatif senaryo | Bu teslimde kanıt yaklaşımı |
|---|---|
| Dış dosya, forbidden write, loopback | Mevcut 3C gerçek Windows fixture'ları yeniden doğrulanır; restricted adayın yetersizliği korunur |
| Çocuk/direkt breakaway | Mevcut job fixture'ları; LPAC çocuk zinciri UNKNOWN |
| Reparse | Mevcut 3B/3C gerçek junction/tag testleri; izin yoksa file symlink skip |
| Beklenmeyen IPC | Modelde open-pipe ve sahte kanal reddi; gerçek LPAC named pipe/COM/ALPC deneyi ÇALIŞTIRILMADI, UNKNOWN |
| Sahte auth/approval, yeni capability | Modelde strict ret; gerçek insan kanalı ve token attestation UNKNOWN |

## 8 GB planı ve aşamalar

1. **Profilsiz native fixture fizibilitesi:** ayrı test executable, sıfır network
   capability, sabit sentetik kök, temiz env, job ve watchdog. Launch/loader
   hatası `ERROR`, güvenlik reddi değil. Allowlisted olumlu okuma şart.
   İzin veya global değişiklik gerektiren durumda dur. Cleanup belirsizse yeni
   deney yok; hiçbir üretim launcher fallback'i yok.
2. **Gerçek sınır matrisi:** aynı token/config altında dış sentineller, forbidden
   write/delete/rename, junction/hard link/race, child/grandchild, owner crash,
   IPv4/IPv6 loopback listener, UDP, kontrollü IPC sentinel'ları. Parent bağımsız
   içerik/identity/bağlantı sayısını doğrular; beklenen OS deny kodu gerekir.
   DNS/harici egress ancak ayrı yetkili laboratuvar çalışmasında; burada yok.
3. **Node ve broker:** sabit runtime ve sentetik script; handle üzerinden okuma,
   kanal spoof/replay/flood, clock/sleep, quota ve crash/outbox testleri. Native
   testler yalnız Windows; saf protokol testleri Ubuntu'da da çalışır.
4. **Provider uyumluluğu:** araç yönlendirme ve auth sahipliği önce protokol/kod
   incelemesi ve offline fixture ile; gerçek provider deneyi ayrı açık yetki
   ister. Bu faz ve eski R4 yetkisi bunun yerine geçmez.
5. **Ürün kapısı:** bağımsız güvenlik incelemesi, exact OS/image/adapter manifesti,
   onay UI gerçekliği, SQLite recovery ve sınırlı read-only kabulü. UNKNOWN
   kaldıkça liveExecution kapalı. VM seçeneği ayrı tasarım/kurulum kararıdır.

8 GB kabul bütçesi önerisi (ölçülmedi): tek managed run; ilk Node fixture job
commit tavanı 512 MiB, en fazla üç süreç, 30 s duvar saati; worker/Electron dahil
idle/peak private bytes, toplam commit, available RAM, CPU, başlangıç ve kill
süreleri ölçülür. 3C'nin 128 MiB native fixture limiti Node/Codex bütçesi değildir.
Codex için limit ancak ölçümle belirlenir; OOM durumunda otomatik limitsiz tekrar
yok. Host'ta en az 2 GiB available RAM hedefi ve paging/UI gecikmesi kabul testi
önerilir; bu değerler performans garantisi değildir. VM için aynı host yüküyle
ayrı ölçüm gerekir; şu anda bütün RAM/latency sonuçları UNKNOWN.

## Değişmeyen güvenlik kapıları

Ürün worker/contracts/storage/native kodu ve CI matrisi değiştirilmedi.
`sandboxFilesystem`, `sandboxNetwork`, `providerCompatibility`, `toolGate`,
`sessionIsolation`, `humanApprovalChannel` ve yeni mimarinin bütün OS sınırları
UNKNOWN. `liveExecution=failed`, `executionAllowed=false`; authorizeExecution
koşulsuz ret. Fixture başarısı, belge veya model sonucu provider izni değildir.

Kaynaklar 6 Kasım 2026'da uzaktan dokümantasyon aracıyla incelendi; bu işlem
fixture ağ testi değildir. Yerel fixture'lar yalnız controlled loopback kullanır.
İstenen install/audit ve GitHub teslimi geliştirme trafiğidir; provider egress yok.
Gerçek komut sonuçları: [1C-3D doğrulama raporu](verification/PHASE-1C-3D.md).
