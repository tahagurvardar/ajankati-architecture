# UI Sprint 1 — A+C sıcak modüler arayüz

28 Ekim 2026. Dal: `feat/ui-ac-hybrid-foundation`; temel: `5ce022d` (main).

## Uygulama ve sınırlar

- `AppShell`: Türkçe gezinme, aktif ekran, içeriğe geç bağlantısı, görünür
  klavye odağı ve ekran değişiminde başlığa odak.
- `Overview`: gerçek snapshot proje/demo görev sayıları, veri gelmeden `—`,
  gerçek ajan sayısı 0 ve ölçülmeyen performans. Ofis/Panel düğmeleri çalışır.
  Ofis, verilen PNG'nin yerel kopyasıdır; oranı korunur, animasyon yoktur ve
  **TASARIM ÖNİZLEMESİ — CANLI OFİS DEĞİL** etiketi görünür.
- `ProjectsPanel`: mevcut proje/görev mutasyonları ve revizyon/hash kabulü.
  Demo çalışırken ekran değiştirilse de Dashboard snapshot takibi sürer.
- Ziyaret edilen Ajanlar/Terminal bileşenleri bağlı kalır. Gezinme kanıtı veya
  terminal oturumunu sıfırlamaz. Gizli terminal için fit/resize gönderilmez.
- Onaylar, Bilgi Kaynakları, Raporlar, Entegrasyonlar dürüst açıklamalar ve
  çalışan ekranlara yönlendirmeler sunar; sahte sayaç veya işlem yoktur.
- Main, preload, worker, contracts, SQLite şeması ve appData konumu değişmez.
  Gerçek CLI oturumları, ücretli çağrı, MCP ve otomatik sürüm doğrulaması yoktur.

## Doğrulama

Windows x64, Node 24.20.0, Electron 45.0.0, pnpm 11.25.0:

| Kontrol | Sonuç |
| --- | --- |
| `pnpm verify` | Lint, typecheck, build ve 12 dosyada 56/56 test geçti |
| `pnpm test:desktop` | Gerçek Electron/SQLite/ConPTY, gezinme ve boyut matrisi geçti |
| `pnpm audit --prod` | Bilinen güvenlik açığı yok |
| Bağımsız kod incelemesi | Arayüz ve kapanış düzeltmesinde açık bulgu yok |

Linux/Windows GitHub CI sonucu PR üzerinde ayrıca izlenir; yerel Windows
sonuçları Linux doğrulaması yerine geçmez.

React testleri gerçek WorkerService + SQLite ile proje/görev oluşturma,
hazırlama, demo, insan kabulü, yeniden mount sonrası kayıtlar, ikinci proje
kapsamı ve iptali sınar. Başlangıç loading/unknown, hata/yeniden deneme,
Ofis/Panel ve placeholder gezinmesi de kapsanır. CLI fixture testi açık sürüm
onayını ve yeniden keşifle sürüm/kanıt sıfırlanmasını kontrol eder.

Electron smoke üretim renderer/preload/main/worker ile çalışır. Sandbox ve CSP
olumsuz kontrolleri korunur. Yerel görsel yükleme, Panel snapshot özeti, tüm
ekranların gezinme/odak/taşma ölçümleri, Windows Türkçe yankı, `Merhaba`, `:size`,
Ctrl+C, gezinme sonrası oturum devamı ve ikinci oturumu kapatma kontrol edilir.
Test verileri geçici profil kullanır; kullanıcının SQLite verisine dokunmaz.

## Görsel kontrolün tekrarı

1. `pnpm build`, `pnpm test:desktop` çalıştırın. PNG'ler
   `apps/desktop/dist/ui-sprint-1/` altında oluşur: `overview-1366x768.png`,
   `overview-1440x900.png`, `projects-1366x768.png`, `terminal-1366x768.png`
   ve 1920×1080 karşılıkları. Görseller test profilinin örnek kayıtlarını içerir.
2. Genel Bakış → Panel Görünümü → Ofis Görünümü; statik etiketi, keskinlik,
   dikey kaydırmayla sahnenin tamamı ve sidebar gezinmesini kontrol edin.
3. Projeler / Görevler → proje oluştur → görev → Hazırla → Demo → insan kabulü;
   ayrı görevde iptal ve uygulamayı yeniden açınca kalıcılığı kontrol edin.
4. Ajanlar → keşfet → gösterilen dosyanın `--version` onayı → yeniden keşif.
   Gerçek sürüm süreci bu sprintin varsayılan testinde çalıştırılmaz.
5. Terminaller → aç → `Merhaba` + Enter → `:size`; başka ekrana gidip dönün;
   Ctrl+C ve yeni oturumda Terminali kapat düğmesini kontrol edin.

## Sınırlamalar ve gözlenen hatalar

- Windows üzerinde otomatik content-area ölçümleri: 1366×768, 1440×900,
  1920×1080; ayrıca 1366×768 ve 820×620'de Electron %125 yakınlaştırma.
  Fiziksel piksel PNG boyutu ekranın device scale factor değerine göre büyür.
  OS seviyesinde %100/%125 scaling değiştirildiği iddia edilmez.
- Ekran görüntüleri araçla görsel incelendi. Native Computer Use bağlantısı
  `native pipe unavailable` hatası verdi; insanın elle fare/klavye kabulü,
  ekran okuyucu ve OS scaling matrisi doğrulanmadı.
- Genişletilen kapatma testi, eski bileşenin kapanış sırasındaki read reddini
  bağlantı kaybı saydığını ortaya çıkardı. Renderer kapanırken yeni I/O'yu
  durdurur, doğrulanmış close yanıtını gösterir; işçi yetkisi genişlemez.
  İlk ikinci-oturum testi eski READY çıktısını erken okuyordu; yeni oturumun
  Çalışıyor durumunu bekler. Başarısız bir turda geçici profil temizliği EPERM
  verdi. Açık manuel test penceresi nedeniyle bir tur single-instance kilidine
  takıldı; o test penceresi normal kapatıldı. Görsel çekim eklenen bir tur zaman
  aşımına uğradı; ilave çekim kaldırıldı ve genişleyen test bütçesi 60/75 sn oldu.
  Gezinme çağrılarının renderer içinde tamamlandığı tanılama kayıtlarıyla
  doğrulandı; sonraki iki tur geçti. Smoke pencereyi baştan gösterip odaklar.
- Vite renderer parçası yaklaşık 574 kB; mevcut 500 kB uyarısı sürer. PNG
  yaklaşık 1.4 MB. Uzun süreli CPU/bellek/8 GB performans hedefi ölçülmedi.
- Otomatik taşma matrisi kısa örnek proje/görevlerle çalışır. 200 karakterlik
  aralıksız başlık/yol senaryosu ayrıca görsel doğrulanmadı.
- `.serena/` ve tasarım referanslarının asılları değiştirilmedi veya commit'e
  eklenmedi. Yalnız uygulamada kullanılan sahnenin kopyası paketlenir.
