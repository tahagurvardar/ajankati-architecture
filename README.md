# AjanKatı

UI Sprint 1: A+C tasarımlı Türkçe gezinme, statik piksel ofis önizlemesi ve gerçek yerel kayıtlara bağlı Panel Görünümü. **Projeler / Görevler** demo oluşturma, yürütme ve insan kabulünü; **Ajanlar** açık onaylı CLI sürüm kontrollerini; **Terminaller** Windows ConPTY güvenli yankı testini sunar. Gerçek ajan oturumları, MCP ve model API'si etkin değildir. Bu sürüm tam MVP veya güvenli otonomi ürünü değildir.

Ofis illüstrasyonu canlı durum göstermez. Onaylar, Bilgi Kaynakları, Raporlar ve Entegrasyonlar açıkça işaretlenmiş gelecek ekranlarıdır. Terminal, menüde başka ekrana geçildiğinde oturumunu korur; kapatma ve beş dakika sınırı geçerlidir. [UI Sprint 1 doğrulama ve görsel kontrol adımları](docs/verification/UI-SPRINT-1.md).

## Ajanlar — gerçek CLI keşfi

Dashboard'daki **Ajanlar → CLI’leri keşfet** sınırlı yerel PATH üzerinde `claude.exe/.cmd` ve `codex.exe/.cmd` kimliklerini bulur; süreç başlatmaz. Her kart gerçek dosya yolunu, sürümü, doğrulama zamanını ve yetenek sınırlarını gösterir. **--version çalıştırmayı onayla** yalnız gösterilen kimlikte tek bir sürüm kontrolüne izin verir. Yeniden keşif önceki onay ve kanıtı sıfırlar. Bulundu / yalnız sürüm doğrulandı / etkin değil ayrı durumlardır.

Worker sabit `--version`, `shell:false`, 4 saniye zaman aşımı ve toplam 4 KiB çıktı sınırı uygular. Zaman aşımında yalnız doğrudan çocuk için sonlandırma ister; genel süreç ağacı temizliği kanıtı değildir. Tam eşleşen Codex npm `.cmd` shim'i çalıştırılmadan paket içindeki native executable'a çözülür. Diğer `.cmd` düzenleri (Claude npm wrapper dahil), `.ps1`, göreli/UNC/device PATH girdileri desteklenmez; sessiz shell fallback yoktur. CLI kurma/güncelleme, auth/config okuma veya model isteği yapılmaz.

`agents` protokol sürümü 1 yalnız `list`, `discover`, `verify` açar. Renderer yol/argv/cwd/env gönderemez. Tek kullanımlık onay keşfedilen kimliğe bağlıdır; çalıştırmadan önce kanonik yol ve dosya üstverisi tekrar denetlenir. Bu kontrol imza doğrulaması veya aynı kullanıcı saldırılarına karşı TOCTOU izolasyonu değildir. Süreç sahipliği, izin, iptal ve sandbox yetenekleri **bilinmiyor**, yönetilen görevler **desteklenmiyor**, etkinlik daima **kapalıdır**.

Envanter yalnız worker belleğindedir; SQLite migration 1 ve mevcut kullanıcı verileri değişmez. Gerçek yerel kanıt ve manuel doğrulama komutları: [Faz 1C-1](docs/verification/PHASE-1C-1.md).

## Çalıştırma

Node.js **24.15+ (24.x)** ve **pnpm 11.25.0** gerekir. Kurulum yalnız bu deponun bağımlılıklarını indirir; global CLI ayarlarını veya credential dosyalarını okumaz. Electron ilk açılışta platform ikilisini indirir; internet erişimi gerekir.

Faz 1C-2A Windows x64 kaynak build'i ayrıca mevcut **MSVC C++ Build Tools, Windows SDK ve Python** gerektirir. Depoya sabitlenen `node-gyp 13.1.0`, dar Node-API Job Object modülünü ve sabit native tanılama başlangıç programını derler. Araç zinciri otomatik/global kurulmaz; eksik araç veya native derleme hatasında güvensiz fallback yoktur. [Faz 1C-2A kanıtı ve sınırları](docs/verification/PHASE-1C-2A.md).

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

`pnpm dev`, build edip Electron'u açan kısa yoldur; hot reload henüz yok. Kaynak çalıştırmasıdır; installer/imzalı dağıtım paketi üretilmez. Proxy kullanan Node 24 ortamlarında Electron indirmesi için yalnız o komutta `NODE_USE_ENV_PROXY=1` gerekebilir; TLS veya sandbox devre dışı bırakılmaz.

GUI olmadan aynı derlenmiş Node worker ve SQLite ile örnek akış:

```sh
pnpm build
pnpm demo
```

Demo kendi geçici veritabanını açar ve temizler; inceleme bekleyen sahte teslimde durur. Ücretli API, gerçek CLI, shell komutu veya kullanıcı proje dosyası çalıştırmaz.

## Windows terminali

Dashboard altındaki **Test terminalini aç** yalnız paket içindeki `safe-echo` programını gerçek ConPTY üzerinde başlatır. Yazdığınız metin komut olarak çalıştırılmaz. Türkçe metin ve Windows yolları aynen yankılanır; `:size` konsol boyutunu, `:exit` normal çıkışı, **Ctrl+C** kesmeyi sınar. `:flood` 3 MiB tanılama çıktısı üretir; atlanan çıktı arayüzde bildirilir. Tek terminal, en fazla beş dakika; yeniden bağlanma veya arka plan çalışma yoktur.

`pnpm build`, kullanılan standalone Node 24 ikilisini yerel `apps/worker/dist/terminal-node.exe` dosyasına kopyalar. Electron'un GUI ikilisinin run-as-node modu Windows konsol TTY'si sağlamadığı için terminal test programı bu sabit runtime ile açılır; PATH üzerinden executable seçilmez. Worker yine Electron'un ayrı Node sürecidir. Build çıktıları Git'e girmez; installer/imzalı dağıtım hâlâ yoktur. Windows build 18309 öncesi reddedilir, WinPTY fallback açılmaz.

Worker PTY'nin tek sahibidir. Terminal IPC'si ayrı `protocol: terminal, version: 1` zarfı kullanır. Renderer executable/argv/cwd/env gönderemez; session UUID ve ana frame denetimleri zorunludur. Çıktı worker'da en fazla 524.288 UTF-16 birimi, her okumada 8.192 birim; xterm geçmişi 5.000 satırdır. Giriş 4.096 birim/istek ve 16 KiB/s; worker istemcisinde en fazla 32 bekleyen istek vardır. Terminal metni SQLite'a yazılmaz; mevcut şema ve mock kabul akışı korunur.

Normal kapatma önce ETX/Ctrl+C, süre dolarsa worker'ın sahip olduğu Job Object'i sonlandırır. `KILL_ON_JOB_CLOSE` worker çökmesinde devreye girer; artık PID watchdog'u yoktur. İşte aktif süreç sıfır olmadan temiz kapanış bildirilmez; belirsiz temizlik yeni oturumu engeller. `:tree` yalnız paketli sabit çocuk/torun tanılama programını açar; kullanıcı komutu/yolu çalıştırmaz. Güvenilir native başlangıç programı önce işe katılır; asıl tanılama hedefi `CREATE_SUSPENDED` + `JOB_LIST` ile oluşturulup üyeliği doğrulanmadan çalıştırılmaz. Bu **OS dosya/ağ sandbox'ı değildir**. Gerçek CLI yürütmesi Faz 1C-2B'ye kadar kapalıdır; sürüm kontrolleri bu job katmanına taşınmadı. [Tarihsel Faz 1B kaydı](docs/verification/PHASE-1B.md).

## Masaüstü akışı

1. Proje adı girin ve **Proje oluştur** seçin. Bu yalnız bir envanter kaydıdır; disk klasörü kaydı veya dosya erişimi izni değildir.
2. Görev hedefini girip **Görev ekle**, ardından **Hazırla** seçin.
3. **Demo ajanını çalıştır** sahte teslim üretir. Görünür etiket: “Demo — gerçek ajan çalışmıyor”.
4. Görev **İnceleme bekliyor** durumuna gelir. Çıktıyı inceleyip **Teslimi kabul et** seçince başarı kaydedilir.
5. Uygulamayı kapatıp yeniden açın; proje, görev, revizyon ve kabul kayıtları korunur. Devam eden mock görev kapanışta kesilir; yeniden açılınca otomatik replay olmaz.

Veriler Electron `appData/AjanKati-Phase1A/foundation.sqlite` dosyasında tutulur (Windows'ta normalde `%APPDATA%\AjanKati-Phase1A`). SQLite/WAL bir sır kasası değildir. Teşhis çıktıları ham görev, env veya credential içermez. Şu küçük sürümde toplam **25 proje / 50 görev**, ad/hedefte **200 karakter**, bir aktif mock görev sınırı vardır; sayfalama/silme henüz yok. Böylece tek IPC snapshot'ı sınırlı kalır. Mevcut veritabanınızı Git'e eklemeyin.

## Kod sınırları

| Dizin | Çalışan sorumluluk |
|---|---|
| `apps/desktop` | Electron ana süreç, sandbox preload, Türkçe React dashboard |
| `apps/worker` | Ayrı Node süreci, mock sevkiyat, iptal, toparlanma, ConPTY test oturumu |
| `packages/contracts` | Sürüm 1 Zod runtime şemaları, tipli istek/yanıt, dar DesktopApi |
| `packages/domain` | İzinli görev durum geçişleri |
| `packages/storage` | SQLite migration 1, FK/WAL/FULL, kısa transaction, revizyon ve hash denetimi, olaylar |
| `packages/adapters` | Ayrı agent/model arayüzleri; yalnız MockAgent uygulaması |
| `tests` | Sözleşme, durum, SQLite, gerçek child IPC, React ve Electron smoke testleri |

Renderer dosya/süreç/SQL erişmez; preload yalnız adlandırılmış yöntemler açar. Main çağıran frame ve dosya URL'sini, worker runtime şemayı yeniden kontrol eder. İçerik güvenli metin olarak gösterilir; CSP ağ bağlantısını kapatır. Worker kendi kalıtsal child IPC kanalını kullanır; HTTP sunucusu/named pipe açmaz. Şimdilik worker ömrü masaüstü bağlantısına bağlıdır; bağımsız arka plan/yeniden bağlanma yoktur. Gerçek adaptör bu sürümde mock-only guard tarafından reddedilir.

Node 24'ün `node:sqlite` API'si kullanılır; `better-sqlite3` native ABI derleme yükü bu ilk dilimde eklenmedi. Electron 45'in gömülü Node 24 runtime'ı worker'ı `ELECTRON_RUN_AS_NODE=1` ile ayrı süreçte açar. Bu Electron'un normal Node çalışma modudur; renderer sandbox açık kalır. Sonraki migration eklenmeden tutarlı yedekleme/restore ve downgrade kapıları geliştirilmelidir. Bilinmeyen ileri DB sürümü veya bozuk DB'de sessiz sıfırlama yoktur.

## Kontroller

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm demo
pnpm test:desktop
pnpm audit --prod
```

`pnpm verify` ilk dört kontrolü sırayla çalıştırır; `pnpm test` için önce build gereklidir (gerçek child IPC testi derlenmiş worker kullanır). `pnpm test:desktop` gerçek Electron ana süreç/preload/renderer/worker/SQLite hattını geçici DB ile sınar. Linux ekransız ortamda `pnpm test:desktop --ozone-platform=headless` veya Xvfb kullanılabilir. Sandbox kapatma bayrağı eklenmez. React DOM testi gerçek servis ve SQLite'a bağlıdır; sahte bir UI API başarısı üzerine kurulmamıştır.

GitHub Actions Linux/Windows'ta aynı kontrolleri ve Electron smoke akışını çalıştırır. ConPTY/Job Object testleri yalnız Windows'ta çalışır; Linux'ta atlanır. Sabit tanılama ağacı için Job Object kanıtı, gerçek CLI uyumluluğu, Windows DACL veya sandbox kanıtı değildir. Gerçek CLI sürüm deneyi yalnız açık yerel opt-in ile yapılır. Tarihsel [Faz 1A](docs/verification/PHASE-1A.md), [Faz 1B](docs/verification/PHASE-1B.md) ve `docs/01–12` korunur; süreç sahipliği sonuçları [Faz 1C-2A kaydındadır](docs/verification/PHASE-1C-2A.md).

## Bilinen sınırlar ve güvenli kilit kurtarma

Worker DB yanında `.lock` dosyasıyla ikinci yazarı reddeder. Normal kapanış kilidi kaldırır. Güç kesintisi veya zorla sonlandırmada kilit **bilerek otomatik çalınmaz**; uygulama açılmayabilir. Bu temel sürümde otomatik sahiplik/heartbeat kurtarma yoktur.

Kurtarmadan önce AjanKatı pencerelerini kapatın ve Görev Yöneticisi'nde ilgili Electron/Node worker süreçlerinin tamamen bittiğini doğrulayın. Hangi süreçlerin sahibi olduğundan emin değilseniz işlem yapmayın; yeniden başlatıp AjanKatı'yı henüz açmadan kontrol edin. İsterseniz **tüm** `AjanKati-Phase1A` klasörünün kopyasını alın (DB/WAL/SHM birlikte). Yalnız bu uygulamaya ait `foundation.sqlite.lock` dosyasını kaldırın; `.sqlite`, `-wal` veya `-shm` dosyalarını silmeyin. Sonra uygulamayı açın: eski `running` kayıtları `interrupted` olur, otomatik yeniden çalışmaz. Yeni deneme için tekrar **Hazırla** seçmek gerekir. Kalıcı hata varsa orijinal veriyi koruyun; boş DB ile değiştirmeyin.

Sıradaki en küçük kilometre taşı Faz 1C-2: kullanıcı onaylı tek bir gerçek Claude Code veya Codex CLI oturumu; süreç ağacı sahipliği ve iptal/çökme temizliği kanıtı ön koşuldur. Otomatik görev devri, arka plan otonomisi ve MCP açılmaz. Ruflo/MCP/skills/API ve ofis sonradan eklenebilir.
