# AjanKatı — Güvenlik ve İnsan Onayı Modeli

Durum: Faz 0 önerisi. Bu belge güvenlik sertifikası veya doğrulanmış sandbox iddiası değildir. [MVP kapıları](05-MVP-ROADMAP.md) geçilmeden güvenli otonomi yayımlanmayacak.

## Güven sınırları

Korunan varlıklar: kullanıcının proje dosyaları ve Git çalışmaları, CLI girişleri, yerel görev/mesaj geçmişi, özel istemleri, onay kayıtları ve kaynak bütçeleri. Güvenilmeyen girdiler: depo talimatları, ajan çıktısı, terminal escape dizileri, MCP/skill açıklamaları, import edilen görevler ve renderer'dan gelen bütün argümanlar.

İşçi ve paketlenmiş uygulama kodu güvenilir işlem sınırıdır. Renderer ele geçirilebilir bir istemci olarak ele alınır. Yerel ajanlar aynı Windows kullanıcısının yetkileriyle çalışabilir: pipe token'ı, app klasöründeki ACL ve worktree tek başına kötü niyetli aynı-kullanıcı sürecine karşı güçlü izolasyon değildir. Yerel yönetici/OS ele geçirilmesi kapsam dışıdır. Güvenli otonomi için doğrulanmış sağlayıcı/OS sandbox ve denetlenebilir eylem kanalı gerekir.

## Değiştirilemez ürün kuralları

1. Global Claude, Codex, MCP ve plugin yapılandırması otomatik değiştirilmez. Güven/izin uyarıları kullanıcı adına önceden kabul edilmez.
2. Auth dosyaları, API anahtarları, token'lar ve özel istemler keşif amacıyla okunmaz. Sırları okuyup sonra maskelemek bu kurala uymaz.
3. Varsayılan olarak CLI/skill/MCP kurulum, paket yükseltme, otomatik commit/push, reset/clean, merge, harici mesajlaşma ve ağ tüneli yok.
4. Otonomi yeni yetki üretmez. Ajan çıktısı, başka ajan mesajı veya proje belgesi insan onayı sayılamaz.
5. Belirsiz durumda yeni yan etki başlatılmaz. Yetki, olay veya sandbox kanıtı kaybolduğunda otonom koşu duraklatılır/durdurulur.
6. Ajanın “tamamlandı” beyanı, görev başarısı veya test geçişi değildir. İnsan kabulü ve doğrulanabilir artefakt gerekir.

## Çalışma modları ve sınırları

| Mod | İzin | Sınır |
|---|---|---|
| Görüntüleme | Görev/mesaj görüntüleme ve güvenli üstveri keşfi | Ajan/MCP çalıştırmaz |
| Etkileşimli terminal | Kullanıcının seçtiği CLI'ye gerçek input | Ajanın kendi izin sistemi geçerlidir; uygulama bu moda “izole” etiketi vermez |
| Onaylı görev | Belirli hedef, proje ve oturum; kritik eylemlerde insan | Güvenli olay/izin kanalı gerekir |
| Sınırlı otonomi | Önceden onaylı kapsam/süre/araç grubu içinde görev adımları | Doğrulanmış sandbox, denetim kanalı ve bütçeler şart |

Otonomi ön koşulları: binary/adaptör uyumu doğrulanmış; dosya ve ağ kapsamı test edilmiş; onay gerektiren eylem öncesi durma mümkün; süreç sonlandırma çalışıyor; DB yazılabilir; politika süresi geçerli. Bir ön koşul yoksa otonomi seçeneği gerekçesiyle devre dışıdır.

Bir terminal üzerinden yürütülen rastgele shell komutunu yalnız metin sınıflandırmayla güvenli kılmak mümkün değildir. Onay sistemi CLI dışındaki alt süreçlerin bütün yan etkilerini kendiliğinden görmez. Ajan shell'ine sınırsız erişim verilen modda AjanKatı mutlak ağ/dosya kısıtı iddia etmeyecek. MVP güvenli otonomi kapısı bu ayrımı gerçek Windows deneyiyle kanıtlamalıdır.

## Onay işlemi

Onay isteğinde eylem türü, hedef proje/run, kanonik dosya veya worktree, argümanların sırdan arındırılmış özeti, ağ hedefi varsa hedef, beklenen yan etki, kapsam ve süre gösterilir. İnsan “Bir kez izin ver”, “Bu görevde şu sınıra kadar izin ver” veya “Reddet” seçer. Genel ve süresiz “her şeyi kabul et” yok.

Onay kaydı `approvalId`, `actionDigest`, `runId`, `policyVersion`, `expiresAt`, karar zamanı ve karar veren kullanıcı bağlamını içerir. Başlatmadan hemen önce işçi bunları yeniden doğrular ve tek kullanımlık onayı atomik olarak tüketir. Parametre, dosya hedefi, executable, branch veya politika değişmişse eski onay geçersizdir. Tekrarlanan istem aynı anahtarla tek kayda bağlanır; yeniden başlatma tüketilmiş izni tekrar kullanamaz.

UI kapalıyken açık bir onay gerekiyorsa görev `awaiting_approval` olur. Bildirim yalnız haber verir; tıklanmış olması onay değildir. Süre aşımı reddetme/bekleme sonucudur, kabul değildir. CLI'nin onay ekranına zamanlayıcıyla `y`, `1` veya Enter yazılmaz. Provider onayı desteklemeyen adaptörde riskli adım çalıştırılmaz.

Durdurma iki ayrı anlam taşır: **Yeni adımları duraklat** sıradaki araç/mesajı engeller; **Koşuyu durdur** mevcut süreci keser. Devam eden dosya yazısını geri alamaz. Kullanıcıya “geri alındı” denmez. Acil durdurma scheduler'ı önce kapatır, sonra provider kesmesi ve süreli süreç ağacı sonlandırması uygular; worktree ve teslimler silinmez.

## Dosya sistemi ve Git

- Renderer yalnız `projectId` ve göreli yol gönderir. Yetkili kök işçi kayıtlarından çözülür; istemci yeni root seçerek yetki büyütemez.
- Kanonik yol ve gerçek dosya kimliği denetlenir. `..`, mutlak/UNC/device yolları, alternatif veri akışları, sürücüye göreli yollar, ayrılmış Windows adları ve yetkisiz junction/reparse noktaları reddedilir. Büyük/küçük harf ve Unicode normalizasyonu test edilir.
- Önce yolu denetleyip sonra açmak yarış riski taşır. Windows handle üzerinden son yol/kimlik doğrulaması veya uygun native katman gerekir. Bu çözüm doğrulanmadan “TOCTOU'ya tamamen dayanıklı” iddiası yok.
- UI dosya işlemleri sınırlandırılsa bile CLI aynı kontrolü atlayabilir; OS/provider sandbox ayrıca gerekir. Başlangıç cwd'si güvenlik sınırı değildir.
- Her yazıcı ajana ayrı, kullanıcıca onaylı çalışma alanı. Worktree oluşturma Git metadata/branch değiştirir; onaylı proje işlemidir. Faz 0'da yapılmadı.
- Ana çalışma ağacında otomatik checkout, stash, reset, clean, commit, push veya merge yok. Worktree bağımlılıklarını global kurulumdan symlink ile bağlayarak yazma sınırı genişletme yok.
- Kullanıcının kirli/izlenmeyen dosyaları korunur. Oluşturma için onaylanmış base commit kullanılır; kirli ana ağaçtaki değişikliklerin yeni worktree'ye taşınmadığı açıkça belirtilir.
- Silme ayrı insan onayı ister; kirli, farklılaşmış veya belirsiz worktree korunur. MVP otomatik GC ve `--force` silme içermez. Branch ve worktree silme ayrı kararlardır.
- Worktree'nin ortak `.git` metadata'sına erişimi izolasyonu azaltır. Mutlak repo güvenliği gerekiyorsa ayrı kopya/sandbox gerekir; worktree güvenlik kutusu değildir. Git hook/filter ve doğrulama script'leri de kod çalıştırabilir; salt “test” adıyla güven kazanmaz.

## Yerel IPC ve renderer

Electron `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; yerel uygulama origin'i dışında navigation yok. Popup varsayılan reddedilir. Harici URL ancak kullanıcı eylemi ve `https/http` allowlist kontrolüyle açılır. `file:`, komut/özel şema ve otomatik terminal link açılışı engellenir. HTML/Markdown güvenilir sayılmaz; raw HTML ve çalıştırılabilir linkler kapalıdır.

CSP yerel paketlenmiş kaynakları sınırlar; uzaktaki script/iframe veya değerlendirilmiş kod yok. Tarayıcı izinleri varsayılan reddedilir; mikrofon/kamera MVP kapsamında değil. PTY çıktısından OSC clipboard yazma, pencere başlığı/hiperlink üzerinden komut başlatma veya otomatik resim dosyası yükleme yok. Büyük/yavaş escape akışları tampon sınırlarına uyar.

Pipe için yalnız yerel kullanıcı SID'si DACL, örnek başına rastgele oturum yetkisi, sınırlı mesaj boyutu, bağlantı/zaman aşımı ve sürüm görüşmesi gerekir. Sır komut satırında veya log'da taşınmaz. Bir GUI bağlantısının token'ı ajan ortamına verilmez. Şema doğrulama ve eylem yetkilendirme işçide tekrar yapılır; preload doğrulaması yeterli değildir.

Kontrol çerçevesi başlangıç sınırı 256 KiB; görev/mesaj gövdesi en fazla 64 KiB; dosya/artefakt içeriği ayrı boyut sınırlı akışla aktarılır. Bilinmeyen yöntem/alan/sürüm reddedilir. Abonelikler proje/run kapsamında yetkilendirilir. Her yazma isteğinde requestId ve revizyon bulunur. Sahte ajan kimliği taşıyan hook/MCP sonucu taşıma kimliğiyle uyuşmazsa reddedilir.

## Sırlar, günlükler ve veri saklama

Kimlik doğrulamanın sahibi CLI'dir. AjanKatı provider anahtarı istemez, mevcut auth dosyasını deşifre etmez veya kendi veritabanına taşımaz. İleride uygulamaya ait bir sır gerekirse Windows korumalı kasa/DPAPI tasarımı ayrıca yapılır; MVP bunu gerektirmez.

Görev ve mesajlar hassas içerik taşıyabilir; yalnız yerel veri dizininde, mevcut kullanıcı izinleri altında saklanır. Bunlar gizli bilgiyi otomatik algılayan bir güvenlik sistemi değildir. Kalıcı ham terminal kaydı varsayılan kapalı. Çalışan terminal belleğinde gerçek çıktı bulunabilir; hiçbir maskeleme sistemi tüm sırları yakalama garantisi vermez.

Teşhis günlükleri istem/çıktı/env içermez; kimlikler, zaman, durum ve hata sınıfıyla sınırlıdır. Varsayılan teşhis log kotası 20 MiB, dönüşümlü ve en fazla 7 gün. Görev/mesajlar kullanıcı silene kadar kalır; ilk sürümde otomatik görev silme yok. Yedek/export kullanıcı eylemiyle ve kapsam önizlemesiyle yapılır. SQLite WAL ve yedeklerde silinen içeriğin kalabileceği belirtilir; “güvenli fiziksel silme” vaat edilmez.

Dış ürün telemetrisi, otomatik crash upload, bulut senkronizasyonu ve uzaktan katalog yok. Faz 0 çevrimdışı kaldı. Gelecekte export'un sırdan arındırılmış olması kullanıcı tarafından gözden geçirilmeden paylaşım yapılmaz.

## Prompt enjeksiyonu ve ajanlar arası yetki

Depo/skill/MCP içeriğinin “izinleri atla”, “şu ayarı değiştir”, “başka ajan aç” talimatı politika üzerinde etkili olamaz. Ajanlar en fazla öneri veya scoped mesaj oluşturur; `approvals`, `policies`, `task_edges` ve işçi DB dosyasına doğrudan yazamaz. Çalışma alanı ve agent sandbox veri dizinine yazmayı engellemelidir; aynı-kullanıcı kısıtı nedeniyle bu izolasyon doğrulanmadan kötü niyetli ajanlara dayanıklılık iddiası yok.

Mesaj gönderen kimliği oturumdan atanır. Görev başına devir/deneme/süre sınırı vardır; iki ajan birbirini sonsuz döngüyle çalıştıramaz. İnsan metni bile CLI shell argümanı olarak doğrudan birleştirilmez. Bir aracın izinli olması başka bir aracı veya dış hedefi izinli kılmaz.

## Kaynak ve ağ politikası

Başlangıç görev duvar saati limiti 30 dakika, en fazla 2 yeniden deneme, görev başına 20 otomatik mesaj devri; kullanıcı bunları başlatmadan önce değiştirebilir. Uyku süreyi ilerletip süreyi doldurduysa uyanmada otomatik devam yerine bekleme olur. CPU/bellek baskısında önce yeni sevkiyat durur; mevcut koşu kullanıcıya bildirilir. Windows Job Object tek başına dosya/ağ sandbox'ı değildir; yaşam döngüsü denetimidir.

Uzak provider bağlantısı CLI'nin normal çalışmasının parçasıdır; açık görev başlatma yetkisi bu amaçla sınırlandırılır. Ek web araştırması, MCP uzak yazması, paket kurma ve iletişim ayrı kapsam ister. Ağ denetiminin provider tarafından uygulanamadığı bir ortamda uygulama yalnız “ağ hedefi kısıtlı otonomi” vaat edemez. Güvenli mod kapalı kalır veya ayrı doğrulanmış OS sınırı gerekir.

Faz 2 telefon erişimi için ayrı tehdit modeli, kimlik doğrulama, cihaz eşleme, oturum iptali, TLS, rate limit ve denetim kaydı gerekir. MVP localhost web sunucusu bile açmayı gerektirmez; dış erişim ve tünel yok.

## Güvenlik kabul testleri

| Senaryo | Kabul |
|---|---|
| Renderer başka proje kökü, keyfi komut veya sahte onay yollar | İşçi reddeder; süreç/dosya yan etkisi oluşmaz |
| Onaydan sonra argv/path/branch değişir veya onay tekrar sunulur | Yeni onay istenir; eski izin kullanılamaz |
| Hook/izin kanalı kopar | Yeni araç/istem yok; koruma uygulanamıyorsa koşu durdurulur |
| Aynı görev iki kez sevk edilir, işçi transaction sonrası çöker | Tek lease; belirsiz dış teslim açıkça görünür, kör replay yok |
| Junction/symlink değiştirilir veya UNC/device yolu gönderilir | Yetkili kök dışı dosya açılmaz; Windows handle tabanlı kanıt gerekir |
| Zararlı terminal linki/OSC dizisi | Komut, dış sayfa veya clipboard yan etkisi oluşmaz |
| Kirli worktree kaldırılmak istenir | Korunur; insan kararı olmadan silinmez |
| Otonomi sırasında kullanıcı pencereyi kapatır | Yalnız önceden verilen arka plan ve eylem kapsamı sürer; yeni onay bekler |
| Kullanım ölçümü veya fiyat bilinmiyor | Sıfır gösterilmez; parasal limitin garanti olmadığı görünür |
| Yeni CLI sürümü/yerel ayar değişimi | Eski uyumluluk iddiası geçersiz; riskli yetenek tekrar doğrulanır |

Bu testler Faz 0'da çalıştırılmadı. Kritik maddeler başarısızsa yayımlama durur; görsel ofisin çalışması güvenlik kabulünün yerine geçmez.
