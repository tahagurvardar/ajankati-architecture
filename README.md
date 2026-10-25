# AjanKatı

Faz 1A: çalışan, yerel **mock** geliştirme merkezi temeli. Gerçek Claude Code/Codex, ConPTY, MCP, model API'si ve piksel ofis henüz yoktur. Bu sürüm tam MVP veya güvenli otonomi ürünü değildir.

## Çalıştırma

Node.js **24.15+ (24.x)** ve **pnpm 11.25.0** gerekir. Kurulum yalnız bu deponun bağımlılıklarını indirir; global CLI ayarlarını veya credential dosyalarını okumaz. Electron ilk açılışta platform ikilisini indirir; internet erişimi gerekir.

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
| `apps/worker` | Ayrı Node süreci, mock sevkiyat, iptal, toparlanma |
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

`pnpm verify` ilk dört kontrolü sırayla çalıştırır; `pnpm test` için önce build gereklidir (gerçek child IPC testi derlenmiş worker kullanır). `pnpm test:desktop` gerçek Electron ana süreç/preload/renderer/worker/SQLite hattını geçici DB ile sınar. Linux ekransız ortamda `pnpm exec electron --ozone-platform=headless tests/fixtures/desktop-smoke.cjs` veya Xvfb kullanılabilir. Sandbox kapatma bayrağı eklenmez. React DOM testi gerçek servis ve SQLite'a bağlıdır; sahte bir UI API başarısı üzerine kurulmamıştır.

GitHub Actions Linux/Windows'ta aynı kontrolleri ve Electron smoke akışını çalıştırır. Bu, ConPTY, gerçek CLI, Windows DACL, Job Object veya sandbox yeteneklerinin kanıtı değildir. Çalıştırılmış komutlar ve sınırlamalar [Faz 1A doğrulama kaydında](docs/verification/PHASE-1A.md), sonraki Windows prosedürü [WINDOWS-CLI.md](docs/verification/WINDOWS-CLI.md) içinde bulunur. Tarihsel `docs/01–12` değiştirilmedi.

## Bilinen sınırlar ve güvenli kilit kurtarma

Worker DB yanında `.lock` dosyasıyla ikinci yazarı reddeder. Normal kapanış kilidi kaldırır. Güç kesintisi veya zorla sonlandırmada kilit **bilerek otomatik çalınmaz**; uygulama açılmayabilir. Bu temel sürümde otomatik sahiplik/heartbeat kurtarma yoktur.

Kurtarmadan önce AjanKatı pencerelerini kapatın ve Görev Yöneticisi'nde ilgili Electron/Node worker süreçlerinin tamamen bittiğini doğrulayın. Hangi süreçlerin sahibi olduğundan emin değilseniz işlem yapmayın; yeniden başlatıp AjanKatı'yı henüz açmadan kontrol edin. İsterseniz **tüm** `AjanKati-Phase1A` klasörünün kopyasını alın (DB/WAL/SHM birlikte). Yalnız bu uygulamaya ait `foundation.sqlite.lock` dosyasını kaldırın; `.sqlite`, `-wal` veya `-shm` dosyalarını silmeyin. Sonra uygulamayı açın: eski `running` kayıtları `interrupted` olur, otomatik yeniden çalışmaz. Yeni deneme için tekrar **Hazırla** seçmek gerekir. Kalıcı hata varsa orijinal veriyi koruyun; boş DB ile değiştirmeyin.

Sıradaki en küçük dilim: yalnız test profiliyle Windows ConPTY terminali açma, Türkçe giriş/resize/Ctrl+C/exit kanıtı. Claude/Codex yönetilen modu, gerçek onay/sandbox kanıtı olmadan açılmayacak. Ruflo/MCP/skills/API ve ofis, mevcut domain/worker sözleşmeleri üzerine sonradan eklenebilir; bu sürüm bunları taklit etmez.
