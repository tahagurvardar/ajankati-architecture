# AjanKatı — CLI Adaptörleri ve Entegrasyon Keşfi

Durum: Önerilen sözleşme; uygulama kodu değildir. Kurulu Claude Code ve Codex sürümleri Faz 0'da çalıştırılmadı veya sorgulanmadı. Referansın kullandığı CLI bayrakları güncel resmi sözleşme sayılmıyor. Kesin komut/bayrak listesi M1 uyumluluk çalışmasında, ayrıca yetkilendirilmiş doğrulama ile sabitlenecek.

## Tasarım ilkesi

Sağlayıcıya özel komut, olay adı, izin davranışı ve oturum devam ettirme bilgisi adaptörde kalır. Orkestratör “Claude Stop geldi” yerine “tur tamamlandı, kaynak ve güven seviyesi şu” görür. Bir sağlayıcıda bulunmayan yetenek diğerinden varsayılmaz. Terminal her durumda gerçek node-pty oturumudur; model yanıtları yerel simülasyonla taklit edilmez.

İki çalışma seviyesi birbirinden açıkça ayrılır:

1. **Etkileşimli terminal:** Kullanıcı CLI ile doğrudan çalışır. Süreç başlatma/veri/resize/çıkış doğrulanır. İşçi görev başarısını veya araç güvenliğini terminal metninden çıkarmaz. Bu mod otomasyon ya da OS izolasyonu garantisi vermez.
2. **Yönetilen görev:** Sağlayıcıya ait doğrulanmış olay/izin kanalı, oturuma özel ayar, sınırlı çalışma alanı ve güvenli teslim yolu vardır. Yalnız bu modda görev sevkiyatı/iki ajan devri ve sınırlı otonomi açılır. Yetenek eksikse kullanıcıya terminal modu sunulur; yönetilen MVP kapısı geçmiş sayılmaz.

## Sözleşme yüzeyi

Aşağıdaki isimler gelecekteki TypeScript modülleri için tasarım sözleşmesidir; gövdeleri veya kaynak dosyaları oluşturulmadı.

| İşlem | Girdi | Çıktı / davranış |
|---|---|---|
| `discover` | Kullanıcının seçtiği executable veya sınırlı PATH adayları | Mutlak yol, dosya kimliği, kurulum türü. Süreç başlatmaz, paket indirmez. |
| `describeCompatibility` | Sonradan onaylı yerel sürüm kanıtı + adaptör sürümü | Yetenek matrisi: `verified`, `unsupported`, `unknown`; her satırın kanıt tarihi ve ortamı. |
| `prepareSession` | Proje/run kimliği, izin politikası, onaylı ayar referansları | `LaunchPlan`: executable, ayrı argv öğeleri, cwd, asgari ortam, input yöntemi, yan etki özeti. Henüz çalıştırmaz. |
| `start` | Onaylanmış plan ve politika hash'i | `SessionHandle`: run/epoch, PID ve başlangıç kimliği, PTY kimliği, varsa sağlayıcı sessionId. Başlatmayı işçi yürütür. |
| `sendTask` | Yapılandırılmış görev zarfı + idempotency anahtarı | `accepted`, `rejected`, `delivery_uncertain`. PTY'ye byte yazılmış olması provider kabulü sayılmaz. |
| `normalizeEvent` | Sağlayıcı olayı ve doğrulanmış taşıma kimliği | Ortak domain olayı; ham bilinmeyen alanlar log'a sınırsız taşınmaz. |
| `answerApproval` | Geçerli ApprovalDecision | Yalnız sağlayıcının doğrulanmış onay kanalı üzerinden cevap. Terminale otomatik “y/Enter” yazılmaz. |
| `interrupt` / `stop` | Sahip olunan run/epoch, neden, süre sınırı | Önce provider/PTY kontrollü kesme; 5 saniye sonra gerekirse süreç ağacı sonlandırma. Kesme geri alma değildir. |
| `resume` | Sağlayıcı sessionId + uyumluluk ve proje kanıtı | Destek varsa yeni run'a bağlı devam; yoksa açık hata. Eski PTY'nin geri gelmesi vaat edilmez. |
| `usage` | Oturum kapsamlı doğrulanmış ölçüm | Token sayıları, kaynağı, ölçüm zamanı, kapsam ve doğruluk; veri yoksa bilinmiyor. |

Yetenekler ayrı ayrı tutulur: `pty`, `taskInput`, `structuredLifecycle`, `approvalResponse`, `toolGate`, `sandboxFilesystem`, `sandboxNetwork`, `sessionSettings`, `resume`, `usage`, `mcpOverlay`, `skillOverlay`. Tek `supportsAutomation=true` bayrağı yeterli değildir.

## İlk iki adaptör

| Boyut | Claude Code | Codex CLI |
|---|---|---|
| Mevcut kurulum | Kullanıcı seçimi veya PATH üzerinden çözümleme | Kullanıcı seçimi veya PATH; Windows npm shim ayrımı |
| Gerçek terminal | ConPTY üzerinde etkileşimli CLI | ConPTY üzerinde etkileşimli CLI |
| Olay kaynağı adayı | Sürümce desteklenen oturum hook'ları / yapılandırılmış olaylar | Sürümce desteklenen yapılandırılmış yerel protokol veya hook'lar |
| Olay kuralı | Hook çıktısı izin kararıyla karıştırılmaz; turn bitişi görev başarısı değil | CLI adı sebebiyle Claude olay adları varsayılmaz; interaktif ve headless yetenekler ayrı |
| Ayar izolasyonu | Destekleniyorsa yalnız oturuma verilen ayar katmanı; global izin/trust yazımı yok | Destekleniyorsa yalnız oturuma verilen seçenekler/katman; global TOML/eklenti yazımı yok |
| Kimlik doğrulama | CLI kendi mevcut girişini kullanır; AjanKatı auth dosyasını açmaz | Aynı; auth dosyasını kopyalama/symlink ile yayma yok |
| Güvenli otonomi | Windows üzerinde gerçek sandbox ve hata durumunda durma ayrıca kanıtlanmalı | Windows üzerinde gerçek workspace/network davranışı ayrıca kanıtlanmalı |
| Devam ettirme | Sağlayıcı oturumu ve proje eşleşmesi doğrulanınca | Sağlayıcı oturumu ve proje eşleşmesi doğrulanınca |
| Kullanım verisi | Yalnız doğrulanan oturum ölçümü; genel geçmiş taraması yok | Mevcut protokol sunarsa; yoksa bilinmiyor |

Referansın `--permission-mode bypassPermissions` veya `-a never` tercihleri AjanKatı'ya aktarılmayacak. Henüz doğrulanmamış hook/JSON/protokol isimleri için komut uydurulmayacak. İki sağlayıcıda da güvenli yönetilen mod kanıtı yoksa “iki sağlayıcılı güvenli otonom MVP” yayımlanamaz; kapsam sessizce terminal demosuna indirgenmez.

## Mevcut kurulum ve global ayarların korunması

- AjanKatı CLI kurmaz, yükseltmez veya kaldırmaz; eksik CLI için durum ve kullanıcının kendi kurulumunu seçme yolu sunar. Uygulamanın kendi Node runtime'ı kullanıcı global Node sürümünü değiştirmez.
- Executable kimliği onaylı mutlak yol, dosya değişiklik bilgisi ve doğrulanan sürümle bağlanır. Dosya değişirse yetenek doğrulaması yenilenir; `PATH` değişikliğinde sessiz başka binary seçilmez.
- Kullanıcının `CLAUDE_*`, `CODEX_HOME`, MCP veya plugin dosyaları otomatik yeniden yazılmaz. CLI'nin kendi normal oturum/geçmiş yazıları ile AjanKatı'nın global ayar değiştirmesi farklıdır; ikincisi yasaktır. İlkinin yan etkileri oturum başlatma bilgisinde açıklanır.
- AjanKatı tarafından oluşturulan ayar/istem dosyaları yalnız kendi run dizinine yazılabilir. Mevcut giriş korunarak oturum katmanı desteklenmiyorsa auth verisi kopyalayarak çözüm üretilmez; yönetilen mod kapalı kalır. Yeni profile ayrı giriş gerekirse kullanıcı kontrollü ayrı seçenek olarak gösterilir; MVP'nin sessiz varsayımı değildir.
- `HOME` veya kullanıcı profilini başka bir dizine topluca yönlendirme yok. Ortam değişkenleri en az gerekli kümeden seçilir. Üst ajan kimliği/otoritesi çocuklara taşınmaz; sır içeren ortam loglanmaz.
- Mevcut kullanıcı ayarları varsayılan MCP/skill çalıştırabiliyorsa bu “güvenli keşif” sayılmaz. Doğrulanmış devre dışı bırakma/allowlist katmanı yoksa otonom oturum açılamaz. Etkileşimli oturum kullanıcının CLI güven sınırları altında açık etiketlenir.

## Windows çalıştırma sınırı

Tam executable yolu ile ayrı argümanlar tercih edilir. Kullanıcı/model metni komut satırı şablonuna eklenmez. Standart ve doğrulanmış npm shim için gerçek yorumlayıcı/giriş dosyası çözümü kullanılabilir; rastgele `.cmd` içeriği kod olarak değerlendirilmez. Güvenilir çözüm yoksa açık hata veya etkileşimli kullanıcı seçimi; sessiz shell fallback yok.

Uzun/çok satırlı görev metni sağlayıcının desteklediği stdin, yapılandırılmış giriş veya onaylı dosya yolundan verilir. Windows komut uzunluğu sınırına ve quoting'e bel bağlanmaz. `& | > < ^ % !`, tırnak, CR/LF ve Türkçe boşluklu yollar test girdisidir. `node-pty` native binary ve ConPTY davranışı paketlenmiş kurulumda ayrıca test edilir.

## Ortak olay ve durum kuralları

| Gözlem | Ortak olay | Yapılmaması gereken çıkarım |
|---|---|---|
| Süreç açıldı | `session.started` | Ajanın kimlik doğruladığı veya görev aldığı |
| Bir araç başladı/bitti | `tool.started` / `tool.completed` | Görevin tamamlandığı |
| Provider onay istiyor | `approval.requested` | Kullanıcının önceden onay verdiği |
| Tur tamamlandı | `turn.completed` | Testlerin geçtiği veya teslimin kabul edildiği |
| Çıkış kodu 0 | `process.exited` | Başarılı ürün sonucu |
| Terminal sessiz | Düşük güvenli `activity.idle_hint` | Güvenli otomatik istem yazılabilecek prompt |
| Ölçüm yok | `usage.unavailable` | Sıfır maliyet |
| Olay kanalı koptu | `session.observation_lost` | Denetimsiz devam etmenin güvenli olduğu |

Her olay run/epoch ile eşleşir; geç, yinelenen ve sırası bozulmuş olaylar test edilir. Kritik bilinmeyen olayda politika açık kalmaz. Provider olayı kullanıcı onayı oluşturamaz. Ajanın kendi “testler geçti” ifadesi araç/test artefaktı veya insan kabulü olmadan doğrulama değildir.

İki ajan mesajında `messageId`, `taskId`, `senderAgentId`, `recipientAgentId`, `runId`, `createdAt`, `causationId`, `kind`, `body`, `artifactRefs` bulunur. Gönderici taşıma oturumundan atanır, modelin verdiği değer kabul edilmez. MVP'de en fazla iki ajan, görev başına en fazla 20 otomatik devir ve 2 yeniden deneme önerilir. Sınır dolunca insan incelemesi gerekir; yeni ajan açıp sınırı aşma yok.

## MCP, skill ve plugin keşfi

Keşif üç ayrı aşamadır: **bulundu**, **uyumlu olduğu doğrulandı**, **bu koşu için etkin**. Arayüz bunları birleştirmez.

Varsayılan keşif yalnız kullanıcıca seçilen dizinlerde dosya/dizin varlığını ve sır içermeyen manifest alanlarını toplar. Genel config dosyası, `.env`, auth dosyası veya SKILL.md gövdesi otomatik okunmaz. MCP ayarının sırla aynı dosyada olduğu durumda dosyayı bütünüyle okuyup sonradan maskelemek “sır okunmadı” sayılmaz; kullanıcıdan sırları ayıklanmış envanter veya yalnız seçili güvenli üstveri alınır. Skill özel istem içerebileceğinden yalnız adı/yolu bilinen kayıt “içeriği incelenmedi” durumunda kalır.

Envanter alanları: tür, görünen ad, kaynak kapsamı (proje/kullanıcı), dosya yolu, sağlayıcı, varlık durumu, doğrulama kaynağı, izin sınıfı, uyumluluk durumu. Komut/env/token değerleri envantere alınmaz. İsim çakışmasında proje kaydı otomatik güven kazanmaz; hangi kaydın seçileceği kullanıcıya gösterilir.

| Mevcut araç | MVP yaklaşımı |
|---|---|
| Claude Code / Codex | Ayrı adaptör; mevcut girişe müdahale yok |
| Ruflo MCP | “Keşfedildi” olarak listelenebilir; ikinci orkestratörü otomatik çalıştırma yok |
| Serena | Proje kapsamı ve sunucu başlatma yetkisi ayrıca onaylanır; bu fazda bağlantı yok |
| GitHub MCP | Uzak yazma/iletişim yetkisi ayrı; mevcut credential okunmaz veya taşınmaz |
| Docker / Python / Node | Kurulum kanıtı varsa bilgi; keşif için daemon, container veya script başlatılmaz |
| Skill/plugin | Ad/kapsam üstverisi; kur/kaldır/güncelle veya özel istem içeriği toplama yok |

MVP yerel kayıtları gösterir; evrensel MCP marketplace veya tüm CLI yapılandırmalarını yorumlayan araç vaat etmez. Sonraki etkinleştirme, yetenek ve izin denetimi geçerse yalnız oturum katmanına yapılır. MCP araç açıklamaları ve skill içerikleri güvenilmeyen talimat kaynağıdır; insan onay politikasını değiştiremez.

## Kullanım ve maliyet

Kümülatif örnekler `(provider, sessionId, epoch, metric)` bazında fark alınarak toplanır; delta örnekler kendi benzersiz kimliğiyle işlenir. Oturum reseti negatif maliyet oluşturmaz. Aynı token hem canlı ölçüm hem transcript üzerinden ikinci kez sayılmaz; kaynak önceliği tanımlıdır.

UI “ölçülen token”, “tahmini maliyet”, “sağlayıcı tarafından bildirilen maliyet” ve “bilinmiyor” ayrımını yapar. Fiyat tablosu model, tarih, para birimi ve kaynak sürümüyle saklanır; abonelik ücreti token tahminiyle özdeşleştirilmez. Faz 0 fiyat sorgulamaz. Sağlayıcı masrafı geç bildiriyorsa parasal tavan kesin fatura limiti sayılamaz; süre/deneme sınırları ayrıca uygulanır. Kullanım bilinmiyorsa maliyet sınırlı otonom politika başlatılmaz veya kullanıcı daha dar süreli, maliyeti bilinmeyen politikayı açıkça seçer.

## Adaptör kabul ölçütleri

- Her sağlayıcıda paketlenmiş Windows uygulamasından gerçek PTY açma, Türkçe giriş, resize, Ctrl+C, exit ve yeniden bağlanma kanıtı.
- Geçerli/bozuk/yinelenen olaylar, onay bekleme ve olay kanalı kesintisi için kayıtlı, sır içermeyen fixture testleri.
- Tüm adaptör değişiklikleri için global config içerik/hash karşılaştırması kontrollü test profilinde yapılır; gerçek kullanıcının sır dosyaları test girdisi olmaz.
- Yönetilen görevde görev zarfının tam bir kez kabulünün veya belirsizliğinin doğru gösterilmesi; yanlış prompt'a otomatik Enter gönderilmemesi.
- Onay kanalı veya sandbox bilinmiyorsa otonominin kapalı kalması; kullanıcıya nedenin Türkçe açıklanması.
- Claude ve Codex'in birbirine kalıcı mesaj/artefakt devrettiği gerçek test, ancak sonraki fazda açık çalışma ve harcama yetkisiyle yapılır.
