# AjanKatı — Lisans ve Özgünlük Değerlendirmesi

Tarih: 24 Ekim 2026. Bu değerlendirme yerelde bulunan metinlerin teknik envanteri ve uygulama sınırlarıdır; satın alma hakkını, marka kullanılabilirliğini veya hukuki sonucu teyit etmez. Kullanıcının ağ/API yasağı nedeniyle dış lisans sayfaları, satıcı koşulları ve marka sicilleri sorgulanmadı. Dağıtım öncesi aşağıdaki açık konular ayrıca doğrulanmalıdır.

## İncelenen birincil yerel dosyalar

Referans kökü: `D:\dev\video-tools\munder-difflin-source`.

| Dosya | Yerel beyan |
|---|---|
| `LICENSE` | MIT License; Copyright (c) 2026 Chaitanya Giri |
| `LICENSE-ASSETS` | Kaynak kod MIT; paketlenen tileset/haritalar ayrı LimeZu lisansında; prosedürel karakter kodu MIT olarak belirtilmiş |
| `src/renderer/src/assets/ATTRIBUTION.md` | Harita/tilesetlerin `shahar061/the-office` üzerinden alındığı, o projenin kodunun ISC olduğu; LimeZu Complete Version alımının 2026-08-20 olduğu beyanı |
| `src/renderer/src/assets/tilesets/LIMEZUASSETS-LICENSE.txt` | Ticari/ticari olmayan kullanım ve düzenleme izni; asset'i başkasına dağıtma/yeniden satma yasağı; LimeZu'ya bağlantılı kredi şartı |
| `src/renderer/src/assets/fonts/LICENSE.txt` | Press Start 2P, Inter ve JetBrains Mono için atıflar ve SIL OFL 1.1 tam metni |
| `package.json`, `package-lock.json` | Bağımlılık kimlikleri/lisans üstverisi; tüm geçişli bağımlılıklar için tam hukuki envanter değil |
| Seçili `node_modules/<paket>/LICENSE` | Electron, React, PixiJS, node-pty, xterm ve better-sqlite3 lisans başlangıçları MIT izin metniyle uyumlu |

Kökte ve kaynak varlık dizininde lisans/notice/attribution dosyaları isim üzerinden tarandı. `node_modules` içindeki her dosya, ikili bileşen, örnek veya geçişli bağımlılık ayrı ayrı incelenmedi. Satın alma makbuzu veya kişisel lisans belgesi aranmadı.

## Hak kategorileri birbirinden ayrıdır

### Kaynak kod

Yerel kök MIT metni kullanım, değiştirme ve dağıtım izinlerini; kopyalarda veya önemli bölümlerde telif ve izin bildiriminin korunmasını düzenliyor. Kodun MIT olması onu “kapalı/proprietary kod” diye sınıflandırmayı desteklemez. Buna karşılık MIT etiketi bütün varlıkların, markaların ve üçüncü taraf içeriğin aynı izin altında olduğu anlamına gelmez.

AjanKatı önerisi kaynak kod, yorum, prompt şablonu, test fixture'ı ve ekran metnini taşımadan yeni uygulama yazmaktır. İleride bilinçli olarak bir kod parçası türetilecekse dosya/satır/köken/lisans kaydı tutulmalı ve gerekli bildirim korunmalıdır. “Yeniden adlandırdık, bu yüzden atıf gerekmiyor” yaklaşımı kabul edilmez. Bu fazda uygulama kodu veya varlık kopyalanmadı.

### Tileset, harita ve üçüncü taraf sanat

Yerel `LIMEZUASSETS-LICENSE.txt`, düzenleme ve projede kullanım izninin yanında asset'in başkalarına dağıtılmasını yasaklıyor. `ATTRIBUTION.md` satın alma beyan ediyor; bu, AjanKatı kullanıcısına lisans devredildiğini veya ham PNG/Tiled dosyalarını yeni repoya koyma hakkı verildiğini kanıtlamaz. Ticari oyunda/uygulamada gömülü dağıtım ile ham asset yeniden dağıtımı ayrımı, yerel kısa metinle kesin çözülemez.

`interiors.png`, `office-tileset.png`, `a5-office-floors-walls.png`, `office.tmj` ve `brooklyn99.tmj` kopyalanmayacak. Harita JSON olması sebebiyle otomatik MIT kod sayılmaz; grafik düzeni ve bağlı artwork ayrıca değerlendirilir. Atıf metnindeki ISC, upstream projenin kodu için bir beyan; LimeZu sanatını ISC yapmaz. Upstream ISC metni ve hak zinciri ayrıca doğrulanmadı.

Öneri: iki masalı sade ofis, karakterler ve ikonlar AjanKatı için özgün oluşturulsun. İleride üçüncü taraf paket alınırsa lisans AjanKatı projesinin sahibi adına edinilmeli; sürüm, kullanım/dağıtım kapsamı, kredi gereği ve satın alma kanıtı özel hak defterinde tutulmalı. Referansın lisans satın aldığı iddiasına dayanılmamalı.

### Prosedürel karakterler, marka ve tanınabilir tasarımlar

`LICENSE-ASSETS` ve `ATTRIBUTION.md`, karakterlerin `scene/office/portraitArt.ts` içinde prosedürel çizildiğini ve MIT kapsamını beyan ediyor. Bu teknik köken, televizyon karakteri benzerliği, adları veya marka kullanımına ayrı izin verildiğini kanıtlamaz.

Munder/Dunder adları, The Office oyuncu/karakter kimlikleri, logo, renk düzeninin ayırt edici bileşimi, ofis düzeni, tanıtım görselleri ve ekran görüntüleri yeni ürüne taşınmayacak. Genel “piksel ofis” fikrinden hareketle yeni yerleşim, bağımsız renk sistemi ve özgün karakterler hazırlanabilir; ayırt edici kompozisyonu birebir taklit etmeme esas alınır.

“AjanKatı” çalışma adı bu fazda kullanıcı tarafından verilmiştir; marka uygunluğu/tescil edilebilirliği araştırılmadı. Claude, Codex, OpenAI, Anthropic, GitHub ve diğer araç adları desteklenen ürünleri açıklamak için metinsel kullanılabilirlik değerlendirmesi gerektirir; ortaklık/onay izlenimi yaratılmamalı. Logolar MVP'de kullanılmasın; sağlayıcı metin adları yeterlidir. Yayın öncesi resmi marka kuralları ve ad araştırması ayrıca yapılmalıdır.

### Fontlar

Yerel font lisans dosyası üç fontu SIL OFL 1.1 olarak listeliyor; bildirim ve lisansın fontla taşınması, değiştirilmiş fontlarda ayrılmış adlara ilişkin koşullar dahil hükümler var. Yerel dosyalar Latin alt kümesi; Türkçe bütün karakterlerin gerçekten bulunduğu bu incelemede doğrulanmadı.

AjanKatı MVP'sinde sistem fontlarıyla başlamak kaynak/dağıtım yükünü azaltır. Sonradan font paketlenirse özgün resmi dağıtımdan edinilmeli; lisans ve telif bildirimi eklenmeli; `İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç` kapsaması test edilmeli. Referans font dosyalarını doğrudan taşımak önerilmiyor.

### Bağımlılıklar ve native bileşenler

Yerel kurulu paket üstverisi aşağıdaki durumdadır. Bunlar AjanKatı için seçilmiş veya güncel olduğu teyit edilmiş sürümler değildir.

| Paket | Yerel sürüm | Üstveride lisans | İnceleme düzeyi |
|---|---|---|---|
| Electron | 32.3.3 | MIT | Paket LICENSE başlangıcı okundu; Chromium/Node ve tüm dağıtım notice'ları doğrulanmadı |
| React | 18.3.1 | MIT | Paket LICENSE başlangıcı okundu |
| PixiJS | 8.18.1 | MIT | Paket LICENSE başlangıcı okundu |
| node-pty | 1.1.0 | MIT | Paket LICENSE başlangıcı okundu; Windows native bileşenleri ayrıca incelenmeli |
| @xterm/xterm | 5.5.0 | MIT | Paket LICENSE başlangıcı okundu; eklentiler ayrıca listelenmeli |
| better-sqlite3 | 11.10.0 | MIT | Paket LICENSE başlangıcı okundu; SQLite ve dağıtılan native parçalar ayrıca listelenmeli |
| i18next | 26.3.6 | MIT | Yalnız package.json üstverisi |
| Zustand | 4.5.7 | MIT | Yalnız package.json üstverisi |

Kök MIT dosyası bu bağımlılıkların kendi bildirimlerini ikame etmez. Geçişli lisanslar, bundled binary'ler, font/ikonlar ve kurulum aracının kaynakları dağıtım SBOM'una dahil edilmelidir. Referansın `node_modules` veya derlenmiş `out` dizini yeni projeye kopyalanmayacak. Yeni projenin gerçek lockfile ve paketlenmiş artefaktı üzerinden lisans envanteri yapılacak.

### CLI ve sağlayıcı koşulları

Mevcut CLI executable'ını çalıştırmak ile CLI binary'sini ürün içinde dağıtmak farklı işlemlerdir. MVP kurulu CLI'yi bulup kullanacak; Claude/Codex binary'si yeniden paketlenmeyecek, oturum/abonelik paylaşılmayacak. Kullanıcının sağlayıcı hesabı koşulları, otomasyon kullanımı ve ticari haklar ayrı başlıklardır; yerel referans MIT lisansı bunları kapsamaz. Güncel sağlayıcı koşulları Faz 0'da dışarıdan doğrulanmadı.

## Temiz oda yaklaşımından yararlanan uygulama yöntemi

Bu denetimi yapan kişi kaynak kodu gördüğü için süreç tam hukuki anlamda “temiz oda” olarak sunulamaz. Öneri, bağımsız tasarımı ve izlenebilir kökeni güçlendiren pratik bir ayrımdır:

1. Kaynak denetiminden yalnız davranış gereksinimi, risk ve doğrulama sorusu çıkar. Referans fonksiyon gövdesi, stil, artwork ve prompt metnini yeni tasarıma taşıma.
2. Yeni kodu [mimari](02-ARCHITECTURE.md) ve [adaptör sözleşmesi](03-AGENT-ADAPTERS.md) üzerinden bağımsız yaz. Referans dosyaları implementasyon şablonu olarak kopyalama.
3. Olanak varsa ileride uygulayıcıya kaynak kod yerine bu davranış belgelerini ver; bu fazda başka ajan çalıştırılmadı.
4. Her yeni görsel/font/ikon için üretici, tarih, kaynak, lisans ve gerekiyorsa satın alma kaydı tut. Referans ekran görüntüsünü çizim şablonu olarak kullanma.
5. Testleri yeni sözleşmeden oluştur; referans test gövdelerini/fixture verilerini taşıma. Teknik fikirden yararlanmak ile ifade biçimini kopyalamak ayrı değerlendirilsin.
6. Bir türetme gerçekten gerekli olursa gizleme: kökeni açıkça kaydet, gerekli MIT/ISC/diğer bildirimi ekle ve ürün özgünlüğü kararını yeniden değerlendir.

## Risk ve yayın kapıları

| Risk / belirsizlik | Önerilen sınır | Kabul kanıtı |
|---|---|---|
| LimeZu lisansının AjanKatı'ya devri/ham dağıtım | Referans sanatını kullanma | Yeni asset listesinde referans PNG/TMJ yok; her varlık özgün veya bağımsız lisanslı |
| Dizi/marka benzerliği | Ad/karakter/logo/yerleşim kopyalama yok | Tasarım köken incelemesi; yayın öncesi marka değerlendirmesi |
| AjanKatı çalışma adının uygunluğu | Tescilli/benzersiz iddiası yapma | Yetkili yayın öncesi ad araştırması |
| Ana paket MIT olsa da alt bileşen farkı | Tam lockfile + dağıtım artefaktı envanteri | SBOM ve gereken notice'lar paket içinde |
| Font alt kümesi ve OFL | Sistem fontuyla başla veya resmi paket edin | Türkçe glif testi + lisans/telif dosyaları |
| CLI kullanım/yeniden dağıtım koşulları | Mevcut kurulumları kullan, binary dağıtma | Sağlayıcı koşulları yayın tarihinde ayrıca gözden geçirilmiş |
| Kod türetmesi ile özgün geliştirme karışması | Köken defteri; bağımsız tasarım | Kaynak/asset incelemesinde açıklanmamış kopya yok |

## Faz 0 sonucu

Yerel kaynak kod MIT olarak lisanslanmış görünür; sanat ayrı ve daha kısıtlıdır. AjanKatı için en düşük belirsizlikli yol, bağımsız kod/mimari ve tamamen özgün görseller; gerekiyorsa ayrı edinilmiş font/asset lisanslarıdır. Bu belgeler herhangi bir üçüncü taraf içeriğini ürün içinde yeniden dağıtma izni vermez.
