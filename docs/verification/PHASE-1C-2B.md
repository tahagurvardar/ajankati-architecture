# Faz 1C-2B — Codex oturum ve kullanım temeli (canlı pilot KAPALI)

28–29 Ekim 2026, Windows x64 10.0.26300.0; Node 24.20.0, Electron 45.0.0.
Kapsam: kullanıcı tarafından izin verilen **engelli teslim**. Gerçek Codex oturumu,
model çağrısı veya ücretli inference başlatılmadı. Claude entegrasyonu kapalı.

## Uygulanan yol ve sınır

[Resmi app-server dokümanı](https://developers.openai.com/codex/app-server)
temel alınarak stdio JSONL, `initialize` → `initialized` → `thread/start` →
`turn/start`, `turn/completed`, `turn/interrupt` ve sağlayıcı izin istekleri incelendi.
PTY metni yaşam döngüsü/izin/başarı kaynağı değildir. Model adı varsayılmaz.
`model/list` bir katalogdur; hesap yetkisini tek başına kanıtlamaz.

`CodexProtocolSession` yalnız test taşımasıyla kullanılan hazırlık katmanıdır.
Üretim `SessionHost` bu driver'ı import etmez, launcher/factory/env override kabul
etmez. `sessions/v1` list/start/interrupt/terminate sözleşmesi main, worker-client
ve worker'da strict doğrulanır. Üretimde yalnız list çalışır; onaylı start dahil
mutasyonlar reddedilir. Renderer executable, argv, shell, cwd, env veya sağlayıcı
belirleyemez. Geçersiz worker protokolü mevcut fail-closed kapanışı kullanır.

Fixture driver: tek kayıtlı oturum, önce durable rezervasyon, en fazla 256 KiB
UTF-8 JSONL tamponu, scoped thread/turn/epoch, sonlu deadline ve cleanup süresi,
structured interrupt ardından sonlandırma. Otomatik retry/resume yoktur. Bütün
server-initiated istekler (bilinmeyenler dahil) kabul edilmeden oturumu keser;
bu sürümde araç izni verme arayüzü yoktur. Tur tamamlanması görev/insan kabulü değildir.
Taşımanın terminate sonucu test varsayımıdır; Windows Codex ownership kanıtı değildir.

## Kurulu native CLI kanıtı

PATH shim çalıştırılmadı. Kurulu npm paketinin native dosyası kullanıldı:
`@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`.

- `--version`: `codex-cli 0.164.0`, çıkış 0.
- `app-server --help`: stdio ve `generate-json-schema` mevcut; çıkış 0.
- `app-server generate-json-schema --out <yerel-geçici-dizin>`: çıkış 0;
  ThreadStartParams, TurnStartParams, InitializeParams ve
  ThreadTokenUsageUpdatedNotification şemaları incelendi.
- Dosya SHA-256: `6F267830B029EE25D9339864AA867CD45DE9F8FD4C5EA007D2E63C13A0C66D36`.

Komutlar kısıtlı ortamda “Could not find home directory / PATH aliases” uyarısı
verdi. Kullanıcı config/auth dosyaları incelenmedi, kopyalanmadı; global ayar
değiştirilmedi. Bu kanıt yalnız sürüm/yardım/şema üretimidir: çalışan app-server
handshake, auth, model erişimi, provider Windows sandbox veya çocuk temizliği
kanıtı değildir. Üretilen büyük şema çıktısı ignore edilen `apps/worker/dist/`
altında tutulur; ürünün otomatik probe'u veya kalıcı capability onayı değildir.

## Neden canlı başlatma kapalı?

1. 1C-2A bootstrap yalnız sabit `terminal-node.exe / safe-echo.cjs` açar.
   Codex binary kimliğini açık handle ile doğrulayan ve kontrollü stdio pipe'larını
   atomik Job association ile birleştiren native launcher yoktur. Çalışan PID'yi
   sonradan job'a bağlama uygulanmadı; diagnostic launcher genelleştirilmedi.
2. Proje kayıtlarında henüz güvenilir kanonik çalışma kökü/onaylı launch planı yok.
3. Codex kullanıcı/proje ayarları, hooks/MCP/skills, auth sahipliği ve sağlayıcı
   Windows izin/sandbox davranışı izole test profilinde doğrulanmadı.
4. Paketli Electron ile gerçek app-server handshake, child ownership, timeout,
   worker crash, interrupt ve temiz kapanış testleri henüz yapılmadı.

Job Object dosya/ağ sandbox'ı değildir. Aynı kullanıcı saldırganı, harici süreç
broker'ları, uyku/uyanma, DACL ve paket imzası için yeni garanti verilmez.
Sadece bir UI bayrağı değiştirerek pilot açılabilecek bir arka kapı yoktur.

## Kullanım defteri ve veri güvenliği

[Issue #7](https://github.com/tahagurvardar/ajankati-architecture/issues/7)
A diliminin temeli: project/run/session kimlikleri, CLI identity/version,
başlangıç/bitiş/süre, durum, neden, thread/turn ve retryCount (bu sürümde 0).
Ham prompt, çıktı, tool argümanı, credential ve env kaydedilmez. Fixture kayıtları
`source=fixture` taşır ve gerçek kullanıcı raporundan dışlanır.

Token kaynağı `thread/tokenUsage/updated.total.totalTokens`; aynı thread/turn için
kümülatif snapshot alınır, tekrarlanan değer toplanmaz, gerileme protokol hatasıdır.
Gerçek event alınmadığından gerçek token ölçümü yoktur. Token alanı eksikse NULL;
ücret/kota daima UNKNOWN. Abonelik hakkı API faturası değildir; token fiyatından
para üretilmez. Kullanım bilinmezken parasal otonomi kapalıdır.

SQLite v2, mevcut v1 için önce SQLite `VACUUM INTO` ile benzersiz tutarlı yedek
(WAL dahil), ardından transaction içinde migration uygular. Yedek başarısızsa
migration başlamaz. Bozuk/ileri sürümlü DB sessizce sıfırlanmaz. Proje, görev ve
olay verileri korunur. Kullanıcının gerçek appData DB'si geliştirme testlerinde
açılmadı; uygulama sonraki normal açılışta yedekli migration yapar.

Tek aktif oturum SQLite unique index ile korunur. Worker restart veya doğrulanamayan
cleanup kaydı yeni driver/worker örneğinde de rezervasyonu tutar. Bu milestone'da
bu karantinayı kaldıran bir API yoktur; otomatik uzlaştırma/yeniden başlatma yok.
Crash sonrası gerçek bitiş zamanı ve süre bilinmediğinden NULL bırakılır.
UI son 100 kaydı okur; açılış/rapor görüntüleme inference başlatmaz.

## Doğrulama

Son doğrulama sonuçları aşağıdaki kayıtla tamamlanır. Testler izole geçici DB/profil
kullanır; mevcut kullanıcı DB'si, `.serena` ve `design-reference` korunur.

- İlk tam koşu: `pnpm verify`, 18 dosyada 93 test başarılı; MSVC native build geçti.
- İnceleme: kalıcı cleanup karantinası ve unsubscribe hatasında termination düzeltildi.
  Regresyonlar önce 3 başarısızlık üretti, düzeltme sonrası geçti.
- Ek yarış testleri synchronous subscribe-exit ve eski epoch callback hatalarını
  önce kırmızı gösterdi; düzeltme sonrası 20 protokol fixture testi geçti.
- Son tam koşu: `pnpm verify` çıkış 0; 29 Ekim 00:01 koşusunda 18 dosyada
  **100/100 test**, 57,82 saniye. Lint/typecheck/MSVC native build geçti.
- `pnpm audit --prod`: bilinen güvenlik açığı bulunmadı; üretim bağımlılığı eklenmedi.
- Gerçek Electron testi: sessions/v1 start açık onayla bile reddedildi;
  sandbox/context isolation, CSP, mock kabul, tüm rotalar/dar ekran/%125 zoom,
  ConPTY Türkçe input/Ctrl+C ve nested-tree cleanup geçti. Örnek tanılama branch/leaf
  PID'leri 16132/3432 kapandı. Bunlar Codex süreçleri değildir.
- Son `pnpm test:desktop` tek başına koşusu çıkış 0; branch/leaf **11128/18404**
  kapandı. Aradaki bir koşu Ctrl+C kontrolü sonrasında genel 60 saniye smoke
  sınırında başarısız oldu. Kod/eşik değiştirilmeden tek başına tekrar geçti;
  eşzamanlı test yükü olası etkendir, kesin kök neden kanıtlanmadı. Zamanlama
  değişkenliği açık test sınırlaması olarak kalır.
- Mevcut 1C-2A normal/force/timeout/root-exit/worker-crash ve başlangıç bariyerleri
  tam test paketinde korunur. Yeni Windows kanıtı blocked IPC/SQLite/Electron
  akışı içindir; gerçek Codex lifecycle testi yapılmadı.

Vite mevcut >500 kB bundle uyarısını verir (~577 kB). RAM/CPU ve 8 GB kapasitesi
ölçülmedi; hedefin karşılandığı iddia edilmez. Canlı mod kapalıyken ek Codex süreci,
oturum polling'i veya harici analitik yoktur.

## İlk insan onaylı canlı testin kesin kapıları

**Bu branch'te canlı test başlatılamaz.** `pnpm dev` yalnız kapalı pilotu gösterir.
Aşağıdaki sıra sonraki enablement değişikliği için zorunludur:

1. Yukarıdaki dört blocker için uygulama ve bağımsız güvenlik incelemesi tamamlanır.
   Native stdio launcher yarış/child/owner-death ve hata testleri inference olmadan
   geçer; genel shell veya keyfi renderer launch yolu eklenmez.
2. Sırsız, ayrı yerel test projesi ve izole provider test profili seçilir. Credential
   taşıma/okuma uygulamaya eklenmez; CLI kimliğinin sahibi insan olur. Config,
   hooks/MCP/skills ve dosya/ağ sınırları bu profil üzerinde doğrulanır.
3. Kurulu binary identity/version tekrar kontrol edilir. Yeni sürüm eski kanıtı
   devralmaz. İnsan onaylı, inference yapmayan app-server handshake ve model
   kataloğu kontrol edilir; model adı/erişim varsayılmaz.
4. `pnpm verify`, `pnpm test:desktop`, `pnpm audit --prod` geçer. Paketli Windows
   smoke kanıtı ve tek aktif oturum sınırı incelemeye bağlanır.
5. İnsan tam proje/CLI/model, tek istem, en fazla 30 saniye, otomatik retry=0,
   maliyet UNKNOWN ve ağdaki provider gönderimi kapsamını görüp **bir kez** onaylar.
   Örnek istem: “Yalnız MERHABA yaz; araç kullanma, dosya okuma/yazma.” Bu metin
   sandbox değildir. Mevcut görev talimatı bu inference için onay sayılmaz.
6. Beklenmedik araç/izin isteği onaylanmadan durdurulur. Ayrı izin yeteneği açılacaksa
   yeni kapsamlı insan kararı gerekir; hiçbir auto-approve/bypass bayrağı kullanılmaz.
7. Tamamlanan turn, interrupt, timeout ve uygulama kapanışı ayrı kontrollü denemeler
   olarak (her inference için yeni insan onayıyla) doğrulanır; job üyeleri sıfır,
   UI durumu ve SQLite ledger karşılaştırılır. Maliyet bilinmiyor kalır; gözlenmeyen
   token değeri uydurulmaz. Başarısızlıkta kapı yeniden kapanır, otomatik retry yoktur.
