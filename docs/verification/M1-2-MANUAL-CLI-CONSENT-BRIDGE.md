# M1.2 — Manual CLI Consent Bridge

Tarih: 7 Kasım 2026. Dal: `feat/m1-2-manual-cli-consent-bridge`.
Başlangıç commit'i: `e9c96bceb8f806bc5664c3b8e390528d44513e07`.

## Karar ve kapsam

Bu teslim yalnız **çevrimdışı hazırlık ve onay köprüsüdür**.
`humanCli.liveLaunch=false`, `humanCli.managedExecution=false`; managed
`liveExecution` kapısı değişmedi ve yürütme kapalıdır. Gerçek Claude/Codex,
`--version` dahil çalıştırılmadı; auth dosyaları okunmadı. Renderer, UI Sprint 2.1
dalı, görseller, R1/R2/R3/R4 kanıtları ve global ACL/firewall/config değiştirilmedi.
Yeni bağımlılık veya ücretli altyapı yoktur. Merge yapılmaz.

## Güven ve sahiplik sınırı

`ajankatiHumanCli` preload API'si yalnız `list`, `selectWorkspace`, `prepare`,
`approve`, `stop` sunar. Renderer path, argv, env, executable, owner veya token
gönderemez. Ana süreç mevcut sender + mainFrame + tam yerel URL kontrolünü korur;
kapanış başladıysa isteği reddeder. Channel yetkiyi seçer, payload strict Zod ile
tekrar doğrulanır. UI düğmesi eklenmedi; API sonraki UI entegrasyonuna hazırdır.

`selectWorkspace()` ana sürecin pencereye bağlı native klasör seçicisini açar.
İptal yeni kayıt oluşturmaz. Yalnız seçicinin tek yolu, main/worker'a özel
`register-workspace` komutuyla gönderilir. Bu komut renderer şemasında yoktur.
Worker kalıtsal child IPC bağlantısının sahibine güvenir; aynı kullanıcı altında
işçiyi doğrudan başlatabilen saldırgan için OS güven sınırı iddia edilmez.

Worker `withNativePath` ile Windows native final path, volume serial ve file ID
üretir; rastgele UUID'yi bu kimliğe bağlar. En çok 16 kayıt tutulur. Aynı yol/kimlik
aynı UUID'yi döndürür; replacement kayıt veya hazırlık sırasında reddedilir ve
eski kayıt silinir. Kayıt, hazırlık ve onayda kimlik yeniden kontrol edilir.
UNC/device/drive-relative/traversal, kısa ad alias, junction/reparse ve yanlış
dosya tipi mevcut native sınırda reddedilir. Hosted Windows fixture kökleri
`realpathSync.native(tmpdir())` ile kanonikleştirilir; üretim kontrolleri gevşetilmez.
Proje DB kaydı filesystem izni değildir; hiçbir DB projesi otomatik kaydedilmez.

Kayıtlar ve onaylar yalnız worker belleğindedir; sahiplik ayrı bir renderer
`ownerId` alanıyla seçilemez. Desktop kapanışında bridge kapanır, worker disconnect
alıp human-cli'yi ilk sırada durdurur; sonrasında mevcut agent/ConPTY/service
kapanışı çalışır. Reload/navigation/crash mevcut uygulama kapanış yoluna gider.
Yeni worker boş kayıt/oturumla başlar. SQLite stale lock otomatik çalınmaz.

## Açık onay ve durumlar

- `prepare`: kayıtlı workspace UUID + keşfedilmiş CLI seçimi; süreç başlatmadan
  exact executable/source metadata ve discovery generation kontrolü. Tek hazırlık;
  asenkron hazırlık 10 saniyeyi aşarsa sonuç reddedilir.
- `prepared`: rastgele session/token, 60 saniyelik süre. Duvar saati geri alma,
  monotonic süre ve aktif timer kontrolü vardır. Token renderer'a dönmez.
- `approve`: main worker'dan oturumu alır ve native onay penceresinde CLI path,
  source/fingerprint, workspace UUID/yolu ve sona erme zamanını gösterir.
  Varsayılan düğme ve Escape **İptal**; olumlu düğme yalnız hazırlık onayıdır.
- Onay main'den worker'a gider; token ilk await'ten **önce** tüketilir. Kimlikler
  ve süre await sonrası yeniden denetlenir. Geçerli onay dahi
  `REAL_LAUNCH_DISABLED` ile reddedilir, durum `blocked`, token `null` olur.
- İptal/native dialog hatası `stopped` üretir. Timeout `expired`; owner stop
  token ve workspace kayıtlarını temizler. Başarısız onay tekrar kullanılamaz.
  Yeni hazırlık yeni session/token gerektirir. Sessiz reconnect veya replay yoktur.
- Aynı bridge'de bekleyen dialog varken diğer komutlar `BUSY` döner. Modal
  penceredeki İptal/Escape kullanılmalıdır; ayrı `stop` çağrısı modalı kapatmaz.
  Worker veya desktop kapanırsa gecikmiş dialog sonucu yetki oluşturamaz.

`human-cli/v1` strict request/response şemaları, 256 KiB frame ve 16 workspace
sınırı kullanılır. WorkerClient en çok 32 bekleyen istek, 10 saniye yanıt süresi
ve request/protocol eşleştirmesi uygular. Hatalı/büyük yanıt ve yanlış handshake
worker'ı kapatır. Human-cli timeout/send hatası veya disconnect client'ı kalıcı
kapatır; eski onay yeniden gönderilemez. Worker hatalı/unknown mesajda durur.

## Offline kabul kapsamı

| Kanıt | Kapsam |
|---|---|
| `human-cli-bridge.test.ts` | Platform bağımsız lifecycle modeli; token gizleme, native seçim iptali, onay/iptal/hata, cross-session, inject edilmiş alanlar, geç onay, owner shutdown ve eşzamanlılık |
| `human-cli.test.ts` | Win32 gerçek native kayıt; dedup/16 limit, replacement, executable değişimi, rediscovery, junction/traversal, clock rollback, süre dolması ve consent yarışları |
| `human-cli-worker.test.ts` | Gerçek child IPC; PATH yalnız geçici sahte `.exe` dosyalarından oluşur; iki CLI kimliği hazırlanır ama hiç çalıştırılmaz. Hatalı sürüm, unknown method/protocol, path injection, büyük frame worker'ı kapatır |
| `human-cli-client.test.ts` | Sentetik IPC peer ile disconnect, timeout, bozuk/büyük/yanlış protokol yanıtı, erken yanıt ve yinelenen ready; gerçek worker kapanışı sonrası kayıt kaybı |
| Desktop smoke | Gerçek production main/preload/worker; test fixture'ında native picker sonucu ikame edilerek iptal/kayıt, güvenlik kapıları ve mevcut UI/ConPTY kontrolleri |
| Mevcut containment/crash suite | Harmless diagnostic süreçlerin worker/owner ölümü, Job-close, child/grandchild cleanup ve başarısız startup regresyonları; provider kanıtı değildir |

Native picker'ın fiziksel kullanıcı tıklaması ve açık gerçek native dialog
sırasında Electron window destroy/reload ayrıca otomatik sürülmedi. Owner geç
sonuç reddi model testlerinde, process cleanup mevcut fixture testlerinde sınandı.
Linux'ta native vakalar `runIf(win32)` ile atlanır; bridge/client/malformed IPC
testleri native modüle bağımlı değildir. Ubuntu yerelde çalıştırılmadı; hosted CI
sonuçları PR'da ayrıca değerlendirilmelidir.

## Gerçek doğrulama sonuçları

Windows x64; Node 24.20.0, pnpm 11.25.0, Python 3.13.15,
MSVC 18.11.12306.390.

| Komut | Sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; 224 reused, 0 downloaded, 7.7 sn; lockfile değişmedi |
| `pnpm verify` ilk başarılı tam koşu | exit 0; lint/typecheck/native+renderer build; 38 dosya, **451 passed / 1 skipped**, 62.12 sn, başlangıç 02:25:43 |
| Son `pnpm verify` | exit 0; lint/typecheck/native+renderer build; **38 dosya / 455 passed / 1 skipped**, 57.65 sn; başlangıç 02:29:16 |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; yeni trusted picker köprüsü, mevcut mock/SQLite/UI/CSP/ConPTY ve nested-tree cleanup PASS; gerçek provider version/inference yok |
| `pnpm audit --prod` | exit 0; `No known vulnerabilities found` |
| `git diff --check` | exit 0 |
| Son odaklı native/host/client/worker koşusu | 4 dosya, **45 passed / 1 skipped**, 2.37 sn; 02:28:03 |

Tek native skip: `rejects a symlink without following its target` —
`Windows account cannot create file symlinks (EPERM)`. Junction ve alias testleri
çalıştı; skip izolasyon kanıtı değildir. Yetki yükseltilmedi.

Başarısız denemeler ve düzeltmeler:

1. İlk bridge testi modül henüz yokken import hatası verdi (TDD red); uygulama
   sonrası bridge/contracts 3 passed, genişletilmiş host/bridge/contracts 21 passed.
2. Odaklı test ve ilk verify çağrısı pnpm store lock sandbox erişim reddiyle durdu;
   izinli normal kullanıcı erişimiyle tekrar çalıştırıldı. OS administrator gerekmedi.
3. İlk gerçek verify lint sonrası typecheck'te test discoveryId'si `offline`
   olduğu için UUID template type hatası verdi; yalnız fixture geçerli UUID'ye
   düzeltildi. Sonraki tam koşu geçti.
4. Ek test patch'i formatlanmış satırı bulamadığı için uygulanmadı; dosyanın
   güncel satırına göre düzeltildi. Yanlış tahmin edilen `.github/workflows/ci.yml`
   yoktu; mevcut `verify.yml` okundu, workflow değiştirilmedi.
5. Mevcut Vite >500 kB chunk uyarısı ve smoke negatif şema/kapalı yürütme logları
   beklenendir; test başarısı veya sandbox kanıtıyla karıştırılmaz.
6. İlk `git add` sandbox `.git/index.lock` yazımını reddetti; yetkilendirilmiş
   normal kullanıcı tekrarı başarılı oldu. Başlangıçta mevcut untracked `.serena/`
   dizini teslim dışında bırakıldı.

Bağımsız salt okunur inceleme mevcut offline kapsamda kritik/önemli hata bulmadı.
Önerilen duplicate/early ready ve registration limit/replacement testleri eklendi.
İnceleyen testleri tekrar çalıştırmadı; yukarıdaki sonuçlar uygulama oturumunundur.

## Sürüme özel gerçek-launch blokörleri

| Tam sürüm | Bilinen kaynak ve eksik kabul |
|---|---|
| Claude Code **2.1.296** | Kullanıcının bildirdiği yerel sürüm; önceki Faz 1C-1 sürüm gözlemi var. Bu fazda yeniden çalıştırılmadı. Exact image/hash + güvenli interaktif argv, başlangıç config/auth/plugin etkileri, izin istemleri, Türkçe cwd, resize/stdin/Ctrl+C ve tüm descendant cleanup için bu sürüme özel kabul yok |
| Codex CLI **0.167.0** | Kullanıcının bildirdiği yerel sürüm; yeni binary/source/protocol eşleştirmesi bu fazda yapılmadı. 0.164.0 initialize/notification/tool araştırması 0.167.0'a taşınamaz. Manual TUI davranışı, config/extensions/client API etkileri, insan izin kanalı, cancellation/cleanup ayrıca doğrulanmalı |
| Codex CLI **0.164.0** | Önceki pinned [probe kanıtı](CODEX-PROBE-SOURCE.md) ve [NO-GO kararı](../15-CODEX-EFFECT-CLOSURE-DECISION.md) aynen korunur. Bunlar 0.167.0 veya manual ConPTY kabulü değildir; toplam etki aracılığı ve OS/credential ayrımı blokörleri sürer |

Native snapshot lease callback sonunda kapanır; executable metadata kontrolü
hash/imza pin'i veya image-create anına kadar atomik kimlik garantisi değildir.
Workspace cwd'si erişim sınırı değildir; içindeki junction'ların gelecekteki CLI
erişimini sınırlamaz. Workspace için çoklu worker arası OS lease yoktur. Restricted
token ve Job Object tam filesystem/network sandbox izolasyonu **değildir**.
Paketlenmiş dağıtım, suspend/resume/power-loss ve hostile provider etkileri ayrıca
kanıt ister. İnsan onayı bunların hiçbirini tek başına sağlamaz.

## Sonraki önerilen milestone

Gerekli kimlik/launch, config/auth etki, minimum environment, ownership/cleanup
ve insan izin kapıları kanıtlandıktan sonra **ayrıca yetkilendirilmiş tek bir
gerçek manual CLI kabul testi**: tek exact provider/sürüm, disposable workspace,
operatör kontrollü giriş, zaman sınırı ve gözlenen process-tree cleanup.
Model isteği/harcama ayrıca yetkilendirilir. Diğer provider'a veya managed
autonomy'ye yetki aktarılmaz. Bu PR gerçek-launch gate açmaz ve merge edilmez.
