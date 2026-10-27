# Faz 1B — ConPTY temeli ve Windows doğrulaması

Tarih: 28 Ekim 2026 (Asia/Baku). Kapsam: izinli `safe-echo` programı; gerçek sağlayıcı veya genel shell değildir.

## Tasarım

Mevcut worker sahipliği genişletildi. Renderer'da süreç açmak güven sınırını ihlal eder; main'de PTY sahipliği mevcut mimarideki işçi sınırını bozar. Ayrı yeni terminal servisi yerine mevcut worker ve kalıtsal child IPC kullanılır; named pipe/HTTP yüzeyi eklenmez. SQLite migration 1 ve mock-only adapter guard değişmez.

Seçimler: kararlı Microsoft `node-pty 1.1.0`, `@xterm/xterm 6.0.0`, `@xterm/addon-fit 0.11.0`; sürümler lockfile'da sabittir. [node-pty sürümleri](https://github.com/microsoft/node-pty/releases) ve npm registry metadata kontrol edildi. Windows x64 hazır native ikilisi kuruldu, yerel C++ derlemesi gerekmedi. Paketle gelen Microsoft ConPTY `1.23.251008001` DLL'i kullanılır (`useConpty: true`, `useConptyDll: true`); eski Windows reddedilir. Bu seçenek upstream tiplerinde experimental olarak işaretlidir; bu laptop üzerindeki kanıt farklı Windows sürümlerinin yerine geçmez.

Terminal protokolü `protocol: terminal, version: 1, requestId, command` zarfıyla task protokolünden ayrıdır. Metotlar: start, input, read, resize, interrupt, close. Runtime şemaları main, client ve worker sınırlarında doğrulanır. Start yalnız safe-echo profilini kabul eder; executable/argv/cwd/env alanları yoktur. Session UUID bir worker/tek yetkili main-frame kanalına bağlıdır; ikinci aktif oturum ve eski/yabancı UUID reddedilir. Pencere/renderer kaybı ve reload uygulamayı kapatır; sessiz reattach olmaz.

Read artan UTF-16 cursor ile yeniden okunabilir; kayıp `dropped` sayısıyla görünür. Worker ring 524.288 birim (UTF-16 temsilinde en fazla 1 MiB; UTF-8 temsilinde 2 MiB'den küçük), cevap 8.192 birim, xterm 5.000 satır. Renderer tek read/write bekler ve giriş için 8.192 birimlik kuyruk tutar; worker istemcisi en fazla 32 bekleyen istek tutar. Input 4.096 birim ve 16 KiB/s. Test programı satırını 4.096 birimde, flood üreticisini yaklaşık bir 3 MiB yazıda sınırlar. Yavaş UI sınırsız push kuyruğu oluşturmaz.

Test programı komut çalıştırmaz; dosya/ağ/alt süreç erişimi yoktur. Türkçe/boşluklu geçici çalışma dizini worker tarafından oluşturulur, normal kapanışta temizlenir. Üretim worker'ında bu dizin DB'nin bulunduğu uygulama veri klasörünün altındadır. Terminal geçmişi DB'ye yazılmaz. PTY çıkışı görev başarısı veya insan kabulü sayılmaz.

## Bulunan Windows sorunları ve çözümleri

- Node'un `stdout.columns/rows` önbelleği resize sonrası eski kalabiliyor. Tanılama programı sabit Node 24'ün `_refreshSize()` yardımcı metoduyla mevcut TTY tutamacından boyutu yeniler; 100×30 doğrulanır. Bu private tanılama hook'u Node yükseltmesinde yeniden doğrulanmalıdır.
- Electron 45 GUI executable'ının run-as-node modu ConPTY çocuğunda beklenen console TTY'yi sağlamadı (test programı çıkış 2). Build'deki standalone Node 24 executable'ı `dist/terminal-node.exe` olarak yerel paketlenir. Worker sabit bu dosyayı ve sabit script'i çalıştırır; PATH çözümlemesi veya renderer seçimi yoktur.
- xterm dinamik stilleri eski CSP'ye takıldı. Main her pencere için kriptografik nonce üretip CSP yanıt başlığını koyar. Yalnız xterm'in senkron `open()` çağrısında oluşturduğu style düğümleri nonce alır; `document.createElement` hemen `finally` ile eski haline döner. `unsafe-inline`, `unsafe-eval`, sandbox kapatma veya ağ açma yoktur.
- Sistem ConPTY backend'inin kill yolunda console-list yardımcısı `AttachConsole failed` üretti. Kaynak incelemesi, console kapandıktan sonra asenkron PID listesiyle sonlandırma yaptığını gösterdi. Bunun yerine paketli Microsoft ConPTY backend'i seçildi: kendi tutamaçlarını kapatır, bu yardımcıyı çalıştırmaz. Önce ETX gönderilir; iki saniyede çıkış olmazsa PTY kill uygulanır ve üç saniyelik çıkış doğrulaması yapılır. `:hold` ile Ctrl+C'yi reddeden tanılama sürecinin zorla temizliği de geçti. Genel CLI süreç ağacı güvenliği yine onaylanmış değildir.
- Paketli ConPTY'nin terminal yetenek sorguları, okuyucusuz testlerde yaklaşık birkaç saniye başlangıç gecikmesi oluşturdu; testler READY koşulunu sonlu süreyle bekler. Aynı sorgular hızlı klavye girişiyle çakışınca tek-inflight girişin karakter düşürdüğü görüldü; sınırlı, sıralı giriş kuyruğuyla düzeltildi.
- Desktop smoke, ekranın altındaki terminali görünür alana kaydırır ve Electron char olaylarını tek karakter olarak yollar; çok karakterli tek char olayı gerçek klavye davranışı değildir.

## Gerçek yerel sonuçlar

Ortam: Windows 11 Home Single Language x64, `10.0.26300`, Node `24.20.0`, pnpm `11.25.0`, Electron `45.0.0`. 27–28 Ekim gece oturumunda laptop üzerinde çalıştırıldı.

| Kontrol | Gözlenen sonuç |
|---|---|
| `pnpm verify` | lint, typecheck, build geçti; 9 test dosyasında 38/38 test geçti |
| Gerçek ConPTY | Türkçe karakterler, boşluklu Türkçe cwd, Windows yol metni ve `& \| > < ^ % !` yankısı geçti |
| Resize / Ctrl+C | Gerçek boyut 100×30, INTERRUPTED çıktısı ve exit gözlemi geçti |
| Normal exit / flood | `:exit` kod 0; 3 MiB çıktı, sınırlı okumalar ve kayıp bildirimi geçti |
| Sahiplik / giriş sınırı | İkinci aktif oturum, yabancı/eski UUID ve aşırı giriş reddedildi |
| Worker yaşam döngüsü | Normal desktop disconnect, başlangıçta ve READY sonrası zorla worker ölümü, Ctrl+C'yi reddeden test sürecinin zorla temizliği geçti |
| `pnpm test:desktop` | Sandbox açık Electron → preload → main → worker → ConPTY → xterm Türkçe klavye roundtrip → Ctrl+C/exit geçti; SQLite mock insan kabulü de geçti |
| `pnpm demo` | Mock teslim inceleme bekliyor durumunda; otomatik kabul oluşturulmadı |
| CSP olumsuz testi | Nonce'suz inline script ve style engellendi; xterm stilleri ihlal üretmedi |
| `pnpm audit --prod` | Bilinen güvenlik açığı bulunmadı |

Build başarılıdır; xterm dahil renderer paketi yaklaşık 562 kB minified olduğundan Vite 500 kB parça boyutu uyarısı verir. Bu performans ölçümü veya 8 GB hedefinin kanıtı değildir.

## Açık sınırlar

Genel Windows Job Object, DACL/named pipe, OS sandbox, imzalı installer ve dağıtım matrisi bu teslimde yoktur. Crash temizliği yalnız kendi watchdog'u olan, alt süreç açmayan tanılama programıyla doğrulandı. Watchdog PID canlılığına dayanır; PID yeniden kullanımı için genel sahiplik garantisi vermez, beş dakikalık mutlak süre sınırı ayrıca vardır. Worker zorla öldürülürse boş test dizini ve Phase 1A'nın fail-closed DB lock dosyası kalabilir; otomatik lock çalma yoktur.

Kaynak dağıtımı build makinesinin Node 24 ikilisini kopyalar; gelecekte installer için doğrulanmış runtime kaynağı/hash, lisans bildirimi ve native paket matrisi gereklidir. Aynı kullanıcı uygulama kodunu/native dosyaları değiştirebiliyorsa bu katman güvenlik izolasyonu sağlamaz. Manuel insan görsel kabulü, uyku/uyanma, ekran okuyucu ve uzun süreli kaynak ölçümü bu kayıtta iddia edilmez.

Auth dosyaları okunmadı/kopyalanmadı; global MCP/CLI/Windows güvenlik ayarı değiştirilmedi; ücretli API veya gerçek Claude/Codex çağrısı yapılmadı.

Sıradaki kilometre taşı: kontrollü Claude Code ve Codex adaptörleri; executable kimliği, izin politikası, süreç ağacı temizliği ve sağlayıcı bazlı onay/sandbox kanıtları önce gelmelidir.
