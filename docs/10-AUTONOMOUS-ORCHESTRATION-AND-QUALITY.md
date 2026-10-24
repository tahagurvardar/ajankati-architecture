# AjanKatı — Otonom Orkestrasyon ve Kalite

Tarih: 24 Ekim 2026. Durum: Faz 0.5 tasarım eki; hiçbir çalışma zamanı testi bu belgeyle geçmiş sayılmaz. Dayanak: [02 — Mimari](02-ARCHITECTURE.md), [04 — Güvenlik](04-SECURITY-MODEL.md), [09 — Entegrasyon](09-UNIVERSAL-AI-INTEGRATION-ARCHITECTURE.md).

## Otonominin tanımı

Otonomi, kullanıcıca önceden onaylanmış proje, görev, araç, veri çıkışı, süre ve bütçe içinde adım yürütmektir. Hedef vermek yayın, ödeme, paket kurma veya mesaj gönderme izni değildir. Scheduler deterministiktir; model plan ve araç çağrısı önerir. Sonuç kabulü insandadır. Pencere kapanması, uyku, worker çökmesi ve OS kapanması [02](02-ARCHITECTURE.md) kurallarına tabidir.

| Seviye | Yapılabilen | Açılma koşulu |
|---|---|---|
| A0 — Görüntüleme | Durum, kanıt ve üstveri inceleme | Model/MCP çalıştırılmaz |
| A1 — Etkileşimli | Gerçek CLI'ye insan girdisi | Mevcut CLI güven sınırı açıkça gösterilir |
| A2 — Onaylı görev | Belirli görev adımlarını araç bazlı onayla yürütme | Doğrulanmış olay/izin kanalı |
| A3 — Sınırlı otonomi | İzinli adımları görev bütçesi içinde yürütme | Sandbox, durdurma, gözlem, kayıt ve bütçe kapıları |

Bu seviyeler tüm sağlayıcıya tek etiket olarak verilmez; ortam/sürüm/görev bazında hesaplanır. Kanıt yoksa A3 kapalıdır. API modeli yalnız öneri üretiyorsa onun araç yetkisi yoktur; yerel araç icrası ayrı sandbox sınavını geçmelidir.

## Planlama ve görev döngüsü

1. İnsan hedefi, kabul ölçütlerini ve kapsamı tanımlar. Modelin plan önerisi güvenilmeyen taslaktır.
2. İşçi kenarları doğrular: aynı proje, mevcut düğümler, döngüsüz DAG, tek yazıcı worktree ve kaynak sınırları. İnsan görevlere ayrılmış planı onaylar.
3. Scheduler yalnız başarılı bağımlılıkları olan `ready` görevi seçer. Politika, yetenek, gözlem kanalı, veri izni ve kaynak durumunu tekrar denetler.
4. Kısa transaction içinde revizyon kontrollü lease/epoch ve bütçe rezervasyonu alınır, run ve outbox yazılır. Commit olmazsa dış çağrı yapılmaz.
5. Adaptör görevi teslim eder. Kabul doğrulanırsa `running`; belirsizse teslim kaydı `delivery_uncertain` ve görev `interrupted` olur. Bu bir otomatik retry nedeni değildir.
6. Ajan çıktısı ve test kanıtları toplanır. Tur tamamlanması `awaiting_review` adayıdır; kalite raporu hazırlanır.
7. İnsan aynı artefakt revizyonunu kabul ederse `succeeded`; düzeltme gerekiyorsa yeni revizyon veya bağlı düzeltme görevi açılır. Eski test/inceleme kaydı değiştirilmez.

`delivery_uncertain` görev durumu değil teslim niteliğidir. Durum kümesi [02](02-ARCHITECTURE.md) ile aynıdır: `draft`, `ready`, `running`, `awaiting_review`, `succeeded`, `blocked`, `awaiting_approval`, `failed`, `cancelled`, `interrupted`.

| Geçiş | Yetkili neden | Koruma |
|---|---|---|
| `draft → ready` | İnsan kapsamı onaylar | DAG ve revizyon geçerli |
| `ready → running` | Scheduler sevk eder | Tek lease, rezervasyon ve gerekli capability kanıtı |
| `running → awaiting_approval` | Yeni kapsam veya kritik araç | Yeni adım yok; mevcut riskli işlem durdurulabilir olmalı |
| `awaiting_approval → ready` | İnsan kararı sonrası yeniden plan | Onay/digest geçerli; eski koşu ile çakışma yok |
| `running → awaiting_review` | Teslim ve kalite raporu hazır | Artefakt sabit; model beyanı test değildir |
| `awaiting_review → succeeded` | İnsan kabulü | Kabul edilen hash ile test/inceleme hash'i aynı |
| Aktif durum → `interrupted` | Crash, gözlem/izolasyon kaybı, belirsiz teslim | Yeni epoch öncesi uzlaştırma |
| Terminal olmayan durum → `cancelled` | İnsan iptali | Yan etki geri alındı denmez |

`blocked` nedenleri bağımlılık, yetersiz kaynak, eksik yetenek, bütçe veya politika olabilir. Neden çözülünce scheduler revizyonu yeniden denetleyerek `ready` yapar. `failed` bağımlılığı açmaz; yeni deneme ayrı run'dır. Onay bekleme aynı süreçte güvenli sürdürülemiyorsa süreç durdurulur, koşu kesinti kaydı korunur.

## Teslim, çökme ve paralellik

Lease sahibi işçi örneği ve epoch ile tanımlanır; PID yeterli değildir. Eski epoch sonucu kayıt altına alınabilir ama yeni run durumunu değiştiremez. Outbox teslimi en az bir kez denenir; model/dosya/Git yan etkilerinde exactly-once garanti edilmez. CLI'ye byte yazılması kabul değildir.

Worker yeniden açılınca önce DB bütünlüğü, eski runs, sahip olunan süreçler ve dış request/session kimlikleri uzlaştırılır. Yaşayan süreç yoksa eski koşu `interrupted`; dış çağrı kesinliği bilinmiyorsa kullanıcı kararı beklenir. İptal edilen HTTP bağlantısının sağlayıcıda durduğu varsayılmaz. Kör replay, eski onayı tüketme veya boş DB oluşturup devam etme yoktur.

İlk sınır iki açık ajan, laptopta varsayılan tek aktif görevdir. API veya Ruflo eklemek bu toplamı gizlice artırmaz. Her model isteği ve her araç icrası görev bütçesine bağlıdır; delegasyon aynı toplam limitleri tüketir. İki yazıcı aynı dizine verilmez. İnceleyici salt okunur sabit teslim üzerinde çalışır; “inceleme” adı shell veya ağa otomatik izin vermez.

## Kalite kapıları

Her görev başlatılmadan uygulanabilir kapılar seçilir. “Uygulanamaz” kararı gerekçeli ve insan tarafından kabul edilmiş olmalı; aracı başarısız kapıyı uygulanamaz yapamaz. Belge görevinde uygulama derlemesi aranmaz; belge bağlantı ve içerik kontrolleri aranır.

| Kapı | Aranan kanıt | Başarısızlığın etkisi |
|---|---|---|
| Q1 — Kapsam | Hedef/kabul ölçütü ve diff uyumu | Teslim incelemeye hazır sayılmaz |
| Q2 — Statik doğruluk | Uygunsa typecheck, lint, Markdown link kontrolü | Düzeltme veya gerekçeli insan kararı |
| Q3 — İşlevsel test | İlgili test komutu, çıkış kodu, test sayısı ve ortam | Kırmızı veya çalışmamış test açık gösterilir |
| Q4 — Güvenlik | İzin, sır, dosya/ağ olumsuz testleri; bağımlılık kanıtı | Kritik bulgu yayını durdurur |
| Q5 — Bağımsız inceleme | Sabit artefakta bağlı başka inceleyici/insan raporu | Modelin kendi onayı yeterli değildir |
| Q6 — Kabul/yayın | İnsan kabulü ve ayrı dış yazma kapsamı | Otomatik başarı/merge/deploy yok |

QualityReport alanları: task/run/epoch, kabul ölçütleri, base commit, artefakt hash'i, değişen dosyalar, komut kimliği ve çalışma dizini, araç/ortam sürümleri, başlangıç/son, çıkış kodu, passed/failed/skipped sayıları, rapor hash'i, inceleyen kimliği ve açık riskler. Günlükte ham istem/env olmaz; test çıktısı hassas olabileceğinden erişim kontrollü artefakttır.

Test komutunu depodan almak kod yürütmektir. Script ve bağımlılık kurma ayrı yetkilendirilir, izolasyon ve ağ kapsamı denetlenir. Testleri geçirebilmek için test silme, eşiği düşürme veya güvenliği kapatma önerisi ayrı değişiklik olarak incelenir. Artefakt değişirse önceki test ve inceleme otomatik geçerli kalmaz.

Fixture testleriyle scheduler, approval ve adaptör sözleşmeleri sınanır. Gerçek smoke testi sürüm/OS/hizmet uyumluluğunu sınar. Model kalite evaluation'ı ise sabit örnek kümesi, sürümlü rubrik, insan puanı ve maliyet/gecikme dağılımıyla yapılır; deterministik birim test gibi değerlendirilmez. Üretim kullanıcı kodu otomatik benchmark girdisi olmaz.

## Bütçe ve sonsuz döngü kontrolü

| Kaynak | Başlangıç sınırı | Sınırda davranış |
|---|---|---|
| Görev duvar saati | 30 dakika; onay/ağ bekleme ve uyku dahil | Yeni adım kesilir; devam için insan revizyonu |
| Yeniden deneme | En fazla 2; ilk deneme ile toplam 3 | Yeni görev açarak aşılmaz; insan incelemesi |
| Otomatik mesaj devri | Görev başına 20 | Görev duraklar, insan bekler |
| Aktif görev | Laptop 1; kullanıcı seçerse 2, masaüstü 2 | Kaynak baskısında yeni sevkiyat yok |
| CLI kesme | 5 saniye kontrollü, sonra sahip olunan süreç ağacı | Worktree/artefakt korunur |
| Para ve token | Kullanıcının görev/proje için belirlediği sonlu limit | Bilinmeyen limit sınırsız kabul edilmez |

Parasal sabit fiyat uydurulmaz. Kullanıcı sonlu proje ve görev tavanı seçer; API isteğinde azami çıktı token'ı zorunludur. Tahmini üst maliyet model/fiyat sürümüyle hesaplanır. Kullanılabilir bakiye = tavan − mutabık harcama − açık rezervasyonlar. Rezervasyon atomik alınır; eşzamanlı istekler aynı bakiyeyi kullanamaz. Yeni çağrı hem görev hem proje limitine uymalıdır.

Kullanım geldiğinde rezervasyon gerçekleşen değerle uzlaştırılır. Kümülatif/delta ve canlı/transcript çakışması [03](03-AGENT-ADAPTERS.md) kurallarına göre tekilleştirilir. Teslim veya ücret belirsizse rezervasyon sıfırlanmaz; insan/sağlayıcı mutabakatına kadar tutulur. CLI kullanım verisi yoksa parasal tavanlı otonomi kapalıdır; insan daha dar süreli, maliyeti bilinmeyen politikayı açıkça seçebilir. Fiyatı bilinmeyen API için otomatik yönlendirme açılmaz.

Yerel rezervasyon sağlayıcının kesin fatura limiti değildir. Gecikmiş kullanım, sağlayıcı fiyat değişimi ve iptal sonrası ücret olabilir. Sağlayıcı tarafı kota varsa ayrıca etkinleştirilir; aşım gözlenince yeni sevkiyat durur ve kullanıcıya fark gösterilir. Retry, fallback, inceleme ve Ruflo alt istekleri aynı bütçeye yazılır.

## Güvenlik ve operasyon

Her ToolProposal için sürüm/argüman/yol/hedef hash'i policyVersion/run/son kullanma süresine bağlanır. Model metni, depo talimatı veya MCP sonucu onay değildir. Commit, push, merge, deploy, mesaj gönderme, kurulum ve silme varsayılan kapalıdır; insan açık ve sınırlı eylem yetkisi verirse ilgili kontrol kapılarıyla yapılabilir. Bu Faz 0.5 yayın görevinin açık GitHub yetkisi, ürünün gelecekteki varsayılanını değiştirmez.

Hook, sandbox veya denetim kanalı kaybında yeni adım yok; durdurma uygulanamıyorsa koşu sonlandırılır. UI arka plan izni yokken kaybolursa 15 saniyede sevkiyat kesilir, 30 saniyelik yeniden bağlanma penceresi sonunda aktif koşular durdurulur. Uyku/güç kapalıyken çalışma vaat edilmez.

Yerel gözlemlenebilirlikte task/run/correlationId, olay sıra numarası, kuyruk bekleme, ret nedeni, rezervasyon ve kalite kapısı sonucu tutulur. Dış analitik yoktur. Teşhis günlükleri 20 MiB dönüşümlü kota ve en fazla 7 gün; ham terminal kalıcı kaydı varsayılan kapalıdır. SQLite görev/mesaj geçmişi kullanıcı silene kadar kalır; artefakt silme ayrı politikadır.

## Kabul senaryoları

- Aynı görev iki kez sahiplenildiğinde yalnız bir lease ve rezervasyon oluşmalı.
- Model “bitti” veya çıkış kodu 0 verdiğinde insan/kalite kanıtı olmadan başarı oluşmamalı.
- Onaydan sonra diff, argüman veya hedef değiştiğinde eski onay reddedilmeli.
- Ağ kopuşu sonrası teslim belirsizliği otomatik tekrar ve ikinci ücret doğurmamalı.
- Ruflo alt görevi, fallback veya iki inceleyici aynı toplam bütçeyi aşamamalı.
- Worker çökmesi/uykudan dönüşte eski epoch olayları yeni denemeyi tamamlayamamalı.
- Test çıktısına yerleştirilmiş prompt enjeksiyonu araç veya yayın izni verememeli.

Bu senaryoların uygulanacağı aşamalar [11 — Revize yol haritası](11-REVISED-MVP-ROADMAP.md) içindedir. Şu anda yalnız mimari gereksinimlerdir.
