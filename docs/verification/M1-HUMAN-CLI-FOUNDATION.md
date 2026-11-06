# M1 — İnsan kontrollü CLI terminal temeli

Tarih: 7 Kasım 2026. Dal: `feat/m1-manual-cli-terminal-foundation`.
Başlangıç: `41d4c38` (Faz 1C-3G NO-GO kararının main'e alınmış hali).

## Teslim ve karar

Bu teslim **backend hazırlık temelidir; iki gerçek CLI için M1 uyumluluk kabulü değildir**.
`human-cli/v1`, Claude Code ve Codex kimliklerini seçebilen ayrı bir sözleşmedir.
Gerçek başlatma her durumda kapalı; managed `SessionHost`, `liveExecution` ve
`authorizeExecution` kapıları değişmedi. Renderer, Figma ve R1–R4 kanıtları değişmedi.
Provider çalıştırılmadı, credential okunmadı, global CLI ayarı değiştirilmedi.

Mevcut ConPTY mimarisini genişletmeden iki hata düzeltildi: geçici dizin oluşturma
hatasından kalan `starting` kilidi ve çok erken iptalde boş Job Object'in
sonlandırılmasının bootstrap çıkışı sanılması. `stop()` artık devam eden başlangıcın
aynı kapanış zincirine katılmasını bekler. Sabit güvenilir bootstrap için hazır/çıkış
bekleme sınırı 10 saniyedir; ardından mevcut süreli temizlik uygulanır. Bu, gelecekteki
keyfi CLI'yi iptalden sonra başlatma izni değildir.

## Mevcut yaşam döngüsü haritası

| Katman | Sorumluluk ve sınır |
|---|---|
| Desktop main / preload | Ana pencere, ana frame ve yerel URL kontrolü; adlandırılmış IPC. Bu teslim yeni renderer köprüsü açmaz. |
| WorkerClient | Kalıtsal child IPC; en çok 32 bekleyen istek; terminal start yanıtı 20 sn, diğer yanıtlar 10 sn. Yanıt zaman aşımı otomatik replay yapmaz. Desktop kapanışında disconnect, 8 sn sonra worker kill fallback. |
| Worker index | Tek DB kilidi ve tek TerminalHost; disconnect/SIGTERM/SIGINT ile stop; human-cli onayını da geçersiz kılar. Yeni protokol ayrı şemayla doğrulanır, hatalı zarf worker kapanışına gider. |
| TerminalHost | `safe-echo` dışında profil yok. Tek oturum, UUID sahipliği, 5 dk süre; sınırlı input/output, resize, Ctrl+C, flood ve tree tanılaması korunur. |
| Native bootstrap | Yalnız rastgele Job adı alır; önce kendisi işe katılır. Sabit hedefi `CREATE_SUSPENDED` + `JOB_LIST` ile yaratır, üyeliği doğrular ve geçici Job handle'ını kapattıktan sonra resume eder. |
| Job owner | Worker'ın non-inheritable handle'ı; `KILL_ON_JOB_CLOSE`. PID listesi yalnız tanılama; sonlandırma yetkisi Job Object'tir. OS dosya/ağ sandbox'ı değildir. |
| Kapanış | ETX, 2 sn grace, Job terminate, en çok 3 sn active=0 bekleme, en çok 3 sn root exit bekleme. Ancak ikisi doğrulanınca `exited`; belirsiz temizlik host'u zehirler ve yeniden başlatmayı reddeder. |
| Çökme / toparlanma | Job handle kapanışı süreçleri sonlandırır; yeniden bağlanma/replay yok. Yeni worker eski insan onaylarını bilmez. DB stale lock otomatik çalınmaz; README'deki manuel kurtarma geçerlidir. |

## Dar insan kontrolü sözleşmesi

| Yöntem | Girdi | Gerçek davranış |
|---|---|---|
| `list` | Boş payload | `mode=human-controlled`, `liveLaunch=false`, `managedExecution=false`; en çok bir hazırlık. |
| `prepare` | `integrationId`, `workspaceId` | Yalnız trusted worker kayıt haritasındaki workspace; keşif kimliği ve native dizin kimliği okunur. Süreç, sürüm kontrolü veya model isteği yok. |
| `start` | `sessionId`, `approvalToken`, `approved=true` | Onayı await öncesinde tüketir; kimlikleri tekrar denetler. Geçerliyse bile `REAL_LAUNCH_DISABLED`; durum `blocked`. |
| `stop` | `sessionId`, `approved=true` | Sahip olunan hazırlığı iptal eder, token'ı siler. Çalışan provider olmadığı için süreç durdurma başarısı iddia etmez. |

Sürüm, yöntem ve ek alanlar strict Zod şemalarıyla reddedilir. `path/cwd/argv/env`,
prompt, task veya owner seçimi yoktur. Input/read/resize, çalışan gerçek session kanıtı
olmadan bu protokole eklenmedi. Eski `terminal/v1` tanılaması ve `sessions/v1`
managed protokolüyle birbirinin yerine kullanılamaz.

Onay tek bir worker instance'ının belleğinde, tek bir hazırlığa bağlı rastgele UUID'dir;
60 saniyede veya saat geri alındığında geçersizleşir. Yeniden keşif ayrı generation
üretir; aynı dosya tekrar bulunsa da eski onay geçmez. Native/source canonical path ve
`dev/ino/size/mtimeNs/ctimeNs` eşleşmesi korunur. Desteklenmeyen `.cmd` reddedilir;
mevcut exact Codex npm shim çözümlemesi shell çalıştırmadan korunur. Keşif onayı,
terminal başlatma onayı yerine kullanılamaz.

Workspace snapshot'ı mevcut `withNativePath` üzerinden final path, volume ve file ID
ile üretilir; junction/reparse/alias sınırlarını mevcut native katman uygular.
Start öncesi yeniden açılıp karşılaştırılır. Kayıt haritası constructor'da kopyalanır;
renderer root kaydı yapamaz. Üretim worker'ında harita **boştur**: workspace picker,
kalıcı kayıt veya otomatik cwd seçimi bu teslimde yoktur. Eski proje adı kaydı dizin
yetkisi sayılmaz. Tek hazırlık sınırı aynı worker içindir; ayrı worker'lar arasında
workspace lease/sahiplik koordinasyonu henüz yoktur. Gerçek başlatma bu nedenle de
açılmaz. Workspace kullanıcı dosyaları cleanup sırasında silinmez; mevcut diagnostic
cleanup yalnız kendisinin ürettiği geçici dizinleri kapsar.

## Doğrulanmayan varsayımlar / kapalı kapılar

- Gerçek Claude/Codex interaktif başlangıç argümanları, auth/config yan etkileri,
  Türkçe yol, resize, stdin, Ctrl+C, normal/erken çıkış ve descendant cleanup kanıtı
  yoktur. Offline fixture sonuçları provider başarısı değildir.
- Dosya üstverisi kontrolü hash/imza doğrulaması değildir; snapshot'tan sonra image
  değiştirme yarışını kapatmaz. Native workspace lease'i callback sonunda bırakılır;
  tüm gerçek session boyunca dosya/ağ izolasyonu sağlamaz.
- Başlangıç cwd'si erişim sınırı değildir. Worktree, onay token'ı ve Job Object sandbox
  değildir. Aynı kullanıcı saldırısı, DACL, paket imzası/kurulum, process breakaway'in
  bütün çeşitleri ve hostile provider etkilerinin kapanışı doğrulanmadı.
- `approved=true`, bir insanın fiziksel tıklamasını kriptografik olarak kanıtlamaz.
  Gelecek desktop köprüsü mevcut trusted-frame kontrollerini korumalı ve executable,
  workspace, süre ile kapsamı açık göstermelidir. Otomatik `y`/Enter/prompt yoktur.
- Gerçek input kullanıcının kontrolünde olsa bile CLI kendi izin/config/extension
  davranışını uygular; interaktif mod managed sandbox kabulünün yerine geçmez.
- Uygulama çökmesi fixture'larda test edilir; uyku/uyanma, OS güç kaybı, paketlenmiş
  dağıtım ve iki gerçek provider için kurtarma kabulü yapılmadı. Kapanış yan etkileri
  geri almaz. Consent bellektedir; kalıcı audit/approval store henüz bağlanmadı.
- Diagnostic başlangıcı kilitlenirse 10 sn başlangıç sınırı desktop'ın 8 sn shutdown
  fallback'ini aşabilir. Böyle durumda worker kill/Job-close devreye girer; graceful
  cleanup başarı yanıtı verilmez. Startup checkpoint crash testleri bu güvenilir
  fixture'a özgüdür, gerçek provider genellemesi değildir.

## Test sonuçları

Ortam: Windows x64, Node 24.20.0, pnpm 11.25.0, Python 3.13.15,
MSVC 18.11.12306.390. Linux bu oturumda çalıştırılmadı.

| Komut | Gerçek sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; 224 reused, 0 downloaded, lockfile değişmedi; 6.8 sn |
| `pnpm verify` | exit 0; lint, typecheck, native + renderer build başarılı; **34 dosya / 415 passed / 1 skipped**, test süresi 61.41 sn, başlangıç 01:13:27 |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock kabul, CSP, UI boyutları, ConPTY Türkçe giriş/Ctrl+C, navigation ve nested-tree cleanup PASS; `sessions/v1 blocked; no inference`, `no automatic version process` |
| `pnpm audit --prod` | exit 0; `No known vulnerabilities found` |
| `git diff --check` | exit 0; whitespace hatası yok |
| `pnpm exec vitest run tests/native-path-boundary.test.ts --reporter=verbose --silent=false` | exit 0; **18 passed / 1 skipped**, 463 ms; yalnız skip nedenini görünür kılmak için tekrar |

Tek skip: `rejects a symlink without following its target` —
`Windows account cannot create file symlinks (EPERM)`. Yetki yükseltilmedi;
atlama izolasyon kanıtı sayılmadı. Junction vakaları çalıştı. Desktop smoke'un
kapalı `sessions-start` ve malformed approval UUID logları beklenen negatif
kontrollerdir. `Downloading Electron binary...` mesajı görüldü. UI kaynak dosyaları
değiştirilmedi; mevcut build/smoke ile regresyon kontrolü yapıldı.

## GitHub CI — Windows runner düzeltmesi

İlk PR #21 CI koşusu: Ubuntu `success`, Windows `failure`. Windows'ta
`tests/human-cli.test.ts` için **7 başarısız test**, tamamı
`Path boundary rejected` hatasıyla `withNativePath` çağrısında durdu.
Bunlar önceki yerel `415 passed / 1 skipped` sonucunun GitHub Windows
runner'ında tekrarlanmadığını gösterir; ilk CI başarısı iddia edilmez.

Neden: test fikstürü `tmpdir()` yolunu doğrudan kullanıyordu. Windows hosted
runner bu dizini alias üzerinden sunabiliyor; native sınır bu yolu haklı olarak
reddediyor. Yalnız test fikstürünün başlangıcı `realpathSync.native(tmpdir())`
ile kanonikleştirildi; üretim `withNativePath`, onay ve yürütme kapıları
değiştirilmedi. Bu düzeltmenin sonuçları GitHub'da yeni commit CI'ı başarıyla
tamamlanana kadar **beklemede** kabul edilmelidir.

## Başarısız ilk denemeler ve TDD izi

- İlk `pnpm test -- tests/human-cli-contracts.test.ts`, pnpm store kilidine sandbox
  erişimi reddedildiği için çalışmadı. İzinli normal kullanıcı tekrarında pnpm `--`
  filtresi tüm suite'i çalıştırdı. Build henüz yoktu: **124 failed / 280 passed /
  1 skipped; 12 failed / 19 passed dosya, 77.47 sn**. Eksik native/built artefakt
  kaynaklı dosyalar: `terminal`, `containment`, `windows-sandbox`,
  `native-path-boundary`, `lpac-preflight`, `worker`, `stdio-transport`,
  `managed-preflight`, `terminal-crash`, `containment-startup`, `native-stdio`.
  On ikinci dosya yeni `human-cli-contracts` idi (henüz export yoktu).
- Doğru filtreyle `pnpm exec vitest run tests/human-cli-contracts.test.ts`:
  önce **1 failed** (`humanCliRequestSchema` yok), uygulama sonrası **1 passed**.
- `human-cli.test.ts`: ilk koşuda yeni host modülü henüz yoktu (suite import hatası);
  uygulama sonrası **8 passed**. Bunlar executable/workspace substitution,
  rediscovery, timeout/clock rollback, stop consent, cross-owner/restart,
  junction, bilinmeyen workspace ve disconnect sırasında hazırlık vakalarıdır.
- `terminal-recovery.test.ts`: önce **2 failed**. Dizin hata sonrası tekrar start
  `sahiplik doğrulanamadı` verdi; erken iptal `Terminal kapanışı doğrulanamadı`
  verdi. İkinci hatada bekleyen test assertion'ı da tamamlanamadı. Düzeltme sonrası
  `terminal-recovery + human-cli + agents`: **3 dosya / 21 passed**, 7.49 sn.
- `human-cli-worker.test.ts`: route eklenmeden önce **1 failed**, IPC yanıtı
  timeout oldu; unknown protocol mevcut worker'ı kapattı. Gerçek IPC doğrulaması
  son suite'in parçasıdır.
- Vite'ın mevcut >500 kB chunk uyarısı güvenlik kapısı kabulü değildir.
- İlk `git add`, sandbox `.git/index.lock` yazımını reddetti; onaylı normal kullanıcı
  tekrarında başarılı oldu. PR varlığı için ilk `gh pr list` ağ erişimi reddedildi;
  onaylı tekrar boş liste döndürdü. OS administrator yetkisi veya policy bypass yok.

## Kod incelemesi

Salt okunur bağımsız incelemede kritik/önemli bulgu yok: consent tüketimi, kimlik
yeniden denetimi, IPC ayrımı ve startup/stop yarışları incelendi. İnceleyen testleri
ayrıca çalıştırmadı; yukarıdaki sonuçlar bu uygulama oturumunun gerçek koşularıdır.
10 sn startup / 8 sn desktop fallback sınırı kabul edilmiş gerçek-launch kanıtı
değil, sonraki kabulde ele alınacak açık sınır olarak tutuldu.

## En küçük sonraki kabul adımı

Önce **yalnız offline fixture** ile trusted desktop workspace seçimi/kayıt sözleşmesi,
önizleme + tek kullanımlık onay ve session ownership akışını uçtan uca bağlamak.
Native image handle/hash pin'in ConPTY oluşturma/resume anına kadar tutulmasını;
workspace değiştirme, onay replay, pencere reload/disconnect, startup timeout,
çocuk/torun crash ve başarısız cleanup durumunda yeniden açmanın reddini kanıtlamak.
Bu adımda da gerçek provider gate kapalı kalmalı.

Sonraki ayrı gerçek-launch kabulünde bir provider/sürüm ve açıkça onaylanmış geçici
workspace seçilmeli; minimum ortam, tam executable kimliği, başlangıç yan etkileri,
human input ve süreç ağacı temizliği gözlenmeli. Model isteği/harcama ayrı yetki ister.
Claude ve Codex kabulü ayrı kaydedilir; biri diğerini veya managed autonomy'yi açmaz.
Bu PR **merge edilmez**, tam managed autonomy **NO-GO** kalır.
