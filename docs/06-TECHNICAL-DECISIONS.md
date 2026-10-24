# AjanKatı — Teknik Karar Kayıtları

Tarih: 24 Ekim 2026. Durum: Faz 0 önerileri. Kullanıcının sabit teknoloji tercihleri ile bu çalışmanın önerileri ayrılmıştır. Hiçbir karar burada uygulanmadı; paket sürümü sabitlenmedi, kurulum veya API çağrısı yapılmadı.

## Sabit girdiler ve varsayımlar

Kullanıcı tarafından istenen temel: TypeScript, Electron, React, PixiJS, node-pty/xterm.js, SQLite, pluggable CLI adaptörleri, kalıcı işçi, görev bağımlılıkları, onay, worktree ve Türkçe öncelik. İlk sağlayıcılar Claude Code/Codex; telefon erişimi Faz 2. Referans salt okunur ve uygulama kodu yazımı kapsam dışı.

Bu çalışmanın varsayımları: Windows 11 x64, tek kullanıcı, yerel NTFS, mevcut CLI'lerde kullanıcı girişi, iki ajan ve küçük/orta yerel projeler. Mevcut araçların sürüm veya etkinlik bilgisi doğrulanmış değildir. Laptop temel performans hedefidir; masaüstü GPU'su çalışma koşulu yapılmaz.

## Kararlar

| Kimlik | Karar / gerekçe | Alternatif ve bedel | Doğrulama / yeniden açma koşulu |
|---|---|---|---|
| K01 | Electron yalnız masaüstü istemcisi; ayrı kullanıcı oturumu işçisi PTY/DB sahibidir. Pencere kapanınca sürebilmek için. | Tek main süreç daha basit ama UI uygulaması yaşam süresine bağımlı; Windows servisi daha karmaşık. | M2: GUI kapanma/çökme testleri; oturum dışı çalışma talebi gelirse servis ayrı tasarlanır. |
| K02 | İşçi TypeScript + paketlenmiş Node runtime; native modüller onun ABI'sine derlenir. | Electron utility process parent yaşam süresine bağlı olabilir; global Node'a dayanmak kullanıcı ortamını kırılgan kılar. | M1/M7 native paketleme ve Job Object testi. Runtime dağıtımı başarısızsa ürün sınırı tekrar ele alınır. |
| K03 | Windows named pipe; mevcut kullanıcı DACL ve ayrı GUI/ajan yetkileri. MVP HTTP portu açmaz. | Loopback HTTP kolay fakat erişim/CSRF/port yüzeyi ekler; aynı kullanıcı saldırısına hiçbir taşıma tek başına çözüm değildir. | Native ACL bağlayıcı kararı M1; uzak erişim gelirse Faz 2 ayrı protokol. |
| K04 | SQLite tek yazıcı, WAL, kısa transaction; durum/olay/outbox birlikte. | JSON/Git/localStorage işletimsel veri parçalanması ve yarış getirir; sunucu DB'si gereksiz kaynak tüketir. | Disk dolma, crash ve migration testleri M2; ağ paylaşımı desteklenmez. |
| K05 | `better-sqlite3` ilk sürücü adayı; yalnız işçide. `synchronous=FULL` başlangıç dayanıklılık tercihi. | Node yerleşik SQLite API'sinin uygunluğu sürüm araştırması gerektirir; main'de senkron DB UI'yi etkiler. | M1 runtime/lisans/ABI kontrolü, M7 gecikme ölçümü; seçilen sürüm daha sonra sabitlenir. |
| K06 | Provider-neutral domain olayları + capability matrisi. | Claude olaylarını ortak standart yapmak Codex farklarını gizler; düz terminal parsing güvenilir politika değildir. | M1/M5 fixture + gerçek sağlayıcı testi. Bilinmeyen sürümde özellik kısıtlanır. |
| K07 | Gerçek PTY etkileşimi ve yönetilen görev sevkiyatı ayrı düzlemler; input sahibi tektir. | Terminale kör istem/Enter enjeksiyonu yanlış prompt'u yanıtlayabilir. | M5 insan input/otomatik sevkiyat yarışı; safe input yoksa yönetilen mod yok. |
| K08 | Global CLI ayarı değişmez; yalnız desteklenen oturum katmanı. Auth kopyalama yok. | İzole home'a bütün config/auth kopyalama kolay ama sır yayılımı ve uyumluluk riski. | Kontrollü test profili karşılaştırması M1/M4; destek yoksa açık yetenek eksikliği. |
| K09 | Koordinasyonu deterministik scheduler yürütür; model plan/sonuç önerir. | Sürekli yönetici LLM ek maliyet ve belirsizlik; modelin görev dosyasını doğrudan düzenlemesi yetkiyi dağıtır. | M3 DAG ve durum makinesi; iki ajan hedefi için üçüncü zorunlu yönetici ajan yok. |
| K10 | En az bir kez teslim girişimi, idempotency, belirsiz teslimi görünür kılma. | Uçtan uca exactly-once dış CLI/dosya yan etkileriyle garanti edilemez. | M3 sevkiyat öncesi/sonrası crash testleri. |
| K11 | İnsan onayı eylem özeti ve revizyonuna bağlı; yokluğunda dur. | Süresiz bypass/auto-yes rahat fakat denetlenebilir sınırı ortadan kaldırır. | M4 replay/parametre değişikliği/kanal kaybı. |
| K12 | Ayrı worktree başına tek yazıcı; birleştirme ve silme insan işi. | Aynı dizinde iki ajan çakışır; worktree izolasyon değildir; ayrı clone daha ağır olabilir. | M4 kirli ağaç/ortak Git metadata testi. Güçlü izolasyon ihtiyacında clone/sandbox değerlendir. |
| K13 | Türkçe varsayılan UI ve görev şablonları; provider ham çıktısı korunur. | İngilizce metni sonradan çevirmek hata/onay kapsamını eksik bırakır. | M6 Türkçe karakter/font/arama ve izin metni testleri; locale saat diliminden ayrı. |
| K14 | Pixi yalnız durum projeksiyonu; 30/15 FPS, görünmezken durur; xterm sınırlı tampon. | Görselden koordinasyon yapmak dayanıklılığı bozar; 60 FPS/çok yüksek DPI 8 GB hedefinde pahalı. | M6/M7 kaynak ölçümü; önce dekor/paralellik azaltılır. |
| K15 | Bellek SQLite notları ve görev artefaktları; embedding ve otomatik özetleyici MVP dışı. | MemPalace/vektör model kurulumu RAM, süreç ve gizlilik yüzeyi ekler. | Kullanıcı ihtiyacı ve ölçülmüş arama ölçeği büyürse yeniden açılır. |
| K16 | Keşif üstveri tabanlı ve çalıştırmasız; etkinleştirme ayrı. | Otomatik MCP healthcheck bile süreç/ağ yan etkisidir; config içinden sır okuma riski. | M6 keşifte süreç/ağ aktivitesi sıfır testi. |
| K17 | Kullanım/maliyet kaynağı ve belirsizliği görünür; NULL sıfır değildir. | Genel fiyat × tahmini token toplamını fatura diye sunmak yanıltır. | M5 kümülatif/delta/oturum reset testi; fiyat güncelliği ayrı süreç. |
| K18 | Dış analitik, otomatik güncelleme/kurulum ve tünel MVP varsayılanında yok. | Operasyonel kolaylık sağlar ama kullanıcı kontrolünü ve kaynak/gizlilik sınırını genişletir. | Sonraki ürün gereksiniminde ayrı onay ve tehdit modeli. |
| K19 | Özgün varlık ve metinler; kaynak denetimi ile yeni uygulama tasarımı ayrılır. | Referans MIT kodunu türetmek mümkün olabilir fakat özgünlük ve attribution yükü doğurur; sanat ayrı lisanslı. | Lisans kapısı M7; [lisans değerlendirmesi](07-LICENSE-ASSESSMENT.md). |

## Başlangıç bütçeleri

Bu değerler öneridir; değiştirilirse mimari, güvenlik, adaptör ve test belgeleri birlikte güncellenir.

| Konu | Başlangıç değeri |
|---|---|
| Açık ajan / aktif görev | En fazla 2 açık; laptop varsayılan 1 aktif, kullanıcı seçimiyle 2; masaüstünde 2 |
| Görev süresi / tekrar | 30 dakika duvar saati; en fazla 2 yeniden deneme; insan artırabilir |
| Otomatik mesaj devri | Görev başına 20; dolunca insan bekleme |
| CLI kontrollü durdurma | 5 saniye, sonra yalnız sahip olunan süreç ağacı |
| Arka plan kapalı GUI kaybı | 15 sn heartbeat kaybında sevkiyat kes; 30 sn yeniden bağlanma penceresi sonunda aktif koşuları durdur |
| Terminal | PTY başına 2 MiB ring; xterm 5.000 satır; istemci başına 256 KiB bekleyen veri |
| Kontrol / mesaj | 256 KiB kontrol çerçevesi; 64 KiB görev veya mesaj gövdesi |
| Görsel | 30 FPS, düşük güçte 15 FPS; çözünürlük 1, üst sınır 1,5; gizli ticker kapalı |
| Boşta uygulama kaynak hedefi | Ajan/OS hariç ≤450 MiB private working set, 60 sn ortalama CPU <%3 |
| Teşhis günlükleri | 20 MiB dönüşümlü kota, en fazla 7 gün; ham istem/env yok |
| Kaçırılan zamanlama | Varsayılan atla; seçilirse en fazla tek telafi; örtüşmeler birleştirilir |

## Sürüm ve bağımlılık stratejisi

Referansın package.json aralıkları veya node_modules sürümleri yeni projenin lockfile'ı olarak kopyalanmayacak. Faz 1'de desteklenen Electron/Node/React/Pixi/node-pty/SQLite sürüm kombinasyonu resmi birincil kaynaklar, paket lisansları ve Windows native build kanıtıyla seçilecek. Bu fazın ağ yasağı nedeniyle güncel destek/CVE durumu araştırılmadı; “güncel ve güvenli sürüm” iddiası yok.

İlk kurulumda yalnız gerekli bağımlılıklar; genel workflow motoru, Redis, vektör DB, tam IDE ve çoklu state framework'ü eklenmez. Native ABI kırılması, paket güncellemesi, IPC şema uyumsuzluğu ve DB migration geri dönüşü yayımlama kontrolünün parçasıdır. Otomatik kendini güncelleyen CLI varsayılmaz; kullanıcı CLI'yi değiştirirse adaptör uyumluluğu yeniden denetlenir.

## Açık karar kapıları

| Kapı | Kapatacak kanıt | Etki |
|---|---|---|
| Windows DACL ve Job Object uygulama aracı | Paketlenmiş süreçte başka kullanıcı erişimi reddi, çocuk sahipliği/çökme testi | Kanıt yoksa bağımsız güvenli arka plan yayımlanmaz |
| Claude Windows sandbox ve görev olayları | Gerçek desteklenen CLI sürümü, reddedilen dış yazma/ağ deneyi ve onay kanalı | Kanıt yoksa Claude otonom mod kapalı; MVP kapsam kararı gerekir |
| Codex interaktif yönetilen protokol | Global ayarsız gerçek session/event/approval ve sandbox deneyleri | Aynı; ref kod varsayımları kabul edilmez |
| Mevcut auth'u bozmayan oturum katmanı | Sahte test profiliyle ayar değişmediği ve gerçek CLI girişinin yeniden kullanılabildiği | Auth kopyalama çözümü kabul edilmez |
| 8 GB iki ajan bütçesi | Gerçek iki CLI ile bellek/CPU ölçümü | Paralellik sınırı veya ürün gereksinimi yeniden değerlendirilir |
| Dağıtım ve sanat hakları | SBOM/notice ve özgün sanat köken defteri | Eksik hakkı olan varlık dağıtıma girmez |

## Teknik kabul

Her önemli kararın sahibi modül ve testi [yol haritasında](05-MVP-ROADMAP.md) tanımlıdır. Bir kapı için “bilinmiyor” yazması kusuru gizlemez; o yeteneğin kullanımını engeller. Faz 0'ın tamamlanması bu kapıların geçildiği anlamına gelmez.
