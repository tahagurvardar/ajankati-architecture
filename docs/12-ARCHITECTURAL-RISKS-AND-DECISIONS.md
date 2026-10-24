# AjanKatı — Mimari Riskler ve Kararlar

Tarih: 24 Ekim 2026. Durum: Faz 0.5 tasarım kararı ve açık risk defteri. Kararlar bu belge seti için önerilen normatif temeldir; uygulanmış veya deneyle doğrulanmış sayılmaz.

## Belge yetkisi ve değişiklik yönetimi

[01 — Kaynak denetimi](01-SOURCE-AUDIT.md) tarihsel bulgudur, yeni runtime kanıtı değildir. [02 — Mimari](02-ARCHITECTURE.md), [03 — Adaptörler](03-AGENT-ADAPTERS.md), [04 — Güvenlik](04-SECURITY-MODEL.md), [05 — Yol haritası](05-MVP-ROADMAP.md), [06 — Kararlar](06-TECHNICAL-DECISIONS.md) ve [07 — Lisans](07-LICENSE-ASSESSMENT.md) değiştirilmeden korunur.

Faz 0.5'te [08](08-CLAUDE-ARCHITECTURE-REVIEW.md) değerlendirmedir; [09](09-UNIVERSAL-AI-INTEGRATION-ARCHITECTURE.md) entegrasyon sözleşmesi, [10](10-AUTONOMOUS-ORCHESTRATION-AND-QUALITY.md) yürütme/kalite politikası, [11](11-REVISED-MVP-ROADMAP.md) güncel teslim sırasıdır. Bu belge hangi eski sınırın korunduğunu veya dar kapsamla genişletildiğini açıklar. Yalnız açıkça sayılan genişlemeler yeni öncelik taşır; diğer eski kurallar geçerlidir. Çözümlenmemiş çelişkide daha dar yetki uygulanır, risk kaydı açılır; sessiz izin genişlemesi yapılmaz.

Faz 0 belgelerindeki ağ/API yasağı ve “bu fazda çalıştırılmadı” ifadeleri o tarihsel kaynak denetiminin kapsamıdır. Faz 0.5 için kullanıcı GitHub yayınına açık yetki vermiştir. Bu, gerçek model çağrısı, paket kurma veya uygulama geliştirme yetkisi değildir. Gelecek ürünün varsayılan commit/push/merge yasağı da bu tek belge yayın görevinin açık yetkisini ortadan kaldırmaz.

## Karar kayıtları

Karar sahibi sütunu gelecekteki sorumlu rol/modüldür; atanmış bir kişi veya mevcut uygulama iddiası değildir. Her karar değişikliği gerekçe, etkilenen belge/sözleşme, test kanıtı ve migration etkisiyle yeni revizyon gerektirir.

| Kimlik | Karar ve gerekçe | Alternatif / bedel | Sahip ve doğrulama kapısı |
|---|---|---|---|
| F05-01 | K01–K05 korunur: kullanıcı oturumu işçisi, named pipe, SQLite tek yazıcı | Bulut servis/ikinci DB ek işletim ve kaynak yükü | Worker/storage; M1/M2/M7 |
| F05-02 | K06 genişler: CLI ajanı, API modeli, MCP aracı ve orkestratör ayrı adaptör türleridir | Tek genel sohbet adaptörü olay/izin farklarını gizler | Contracts/adapters; Faz 1.1 sözleşme testi |
| F05-03 | K09 korunur: scheduler ve politika yalnız AjanKatı'da; Ruflo isteğe bağlıdır | Ruflo veya Claude'u çekirdek yönetici yapmak çift otorite yaratır | Domain/coordinator; M3 ve Faz 1.3 |
| F05-04 | Routing önce politika filtresi, sonra sürümlü puan; kullanıcı sabitlemesi vardır | Sadece en ucuz/en güçlü model veri/yetenek sınırını aşabilir | Router/policy; Faz 1.3 evaluation |
| F05-05 | K08/K16 korunur: keşif üstveridir, etkinleştirme ayrı; global ayar/auth taşınmaz | Otomatik config import sır ve özel istem toplayabilir | Discovery; M6 ve Faz 1.2 negatif test |
| F05-06 | K17 genişler: sonlu API limiti, atomik rezervasyon ve belirsiz ücret defteri | Yalnız sonradan ölçüm iki paralel istekte aşımı önleyemez | Budget/storage; Faz 1.1 yarış/timeout testi |
| F05-07 | K11 korunur: onay eylem digest/run/policy/süreye bağlı; yayın ayrı kapsamdır | Genel auto-yes denetlenebilir sınırı kaldırır | Policy; M4 replay ve mutasyon testi |
| F05-08 | K12 korunur: worktree tek yazıcı; gerçek sandbox ayrıca gerekir | Aynı dizinde çok ajan veya worktree'yi sandbox saymak veri riski | Workspaces/security; M4 Windows testi |
| F05-09 | Kalite raporu sabit artefakta bağlı; model beyanı, test ve insan kabulü ayrıdır | Otomatik “bitti” başarıyı yanlış gösterir | Quality/domain; M5 ve Q1–Q6 |
| F05-10 | API fazında yeni kullanıcı sırrı Windows kasasında; DB yalnız secretRef tutar | CLI auth kopyası veya düz .env farklı risk taşır | Secret-vault; Faz 1.1 sızıntı/rotasyon testi |
| F05-11 | MVP manuel iki CLI'dir; API/aktif uzantılar/routing ayrı fazlarda açılır | Her şeyi MVP'ye koymak native güvenlik kapılarını geciktirir | Ürün sorumlusu; M7 ve sonraki faz kapıları |
| F05-12 | Kanıt sürüm/OS/taşıma/model kapsamlıdır; unknown yetki vermez | “OpenAI uyumlu” veya araç adıyla bütün yeteneği varsayma | Compatibility/security; her adaptör yayını |
| F05-13 | Dış analitik yok; görev bağlamı varsayılan local-only; dış aktarım açık kapsamlıdır | Her modele tüm repo gönderimi özel veri riskini büyütür | Context/policy; Faz 1.1 veri çıkışı testi |
| F05-14 | K10 korunur: en az bir kez teslim girişimi; belirsiz dış yan etki kör tekrarlanmaz | Exactly-once iddiası çökme/timeout aralığını saklar | Scheduler/adapters; M3/M5/Faz 1.1 |

F05-10 yalnız API aşamasını genişletir; ilk CLI MVP'sinin “anahtar istememe” kuralı değişmez. F05-11, [05](05-MVP-ROADMAP.md) içindeki otomatik model seçiminin MVP dışı olmasını korur. F05-02 ve F05-03, Ruflo'yu zorunlu bağımlılık yapmaz. Sayısal başlangıç bütçeleri K01–K19 kaydından devralınır; değişiklik ölçüm ve belge revizyonu gerektirir.

## Risk derecelendirmesi

Etki ve olasılık yüksek/orta/düşük olarak nitel değerlendirmedir; istatistiksel ölçüm değildir. Kritik risk kullanıcı verisi, yetki veya geri alınamaz dış yan etkiyi etkiler. “Açık” kanıtın henüz bulunmadığı anlamına gelir. Kontrol planlanmış olsa bile gerçek olumsuz test geçmeden risk kapanmaz.

| Kimlik | Risk / etki | Olasılık | Kontrol ve kapatacak kanıt | Sahip / kapı |
|---|---|---|---|---|
| R01 | Windows CLI sandbox eksikliği; kapsam dışı dosya/ağ erişimi — kritik | Yüksek | Gerçek sürümde dış yazma/ağ denemesi reddi; kanıt yoksa A3 kapalı | Security/adapters; M1/M4 |
| R02 | Aynı kullanıcı sürecinin pipe/DB/approval taklidi — kritik | Orta | DACL + oturum capability + OS/provider sandbox; aynı-kullanıcı sınırı açık gösterilir | Worker/security; M1/M4 |
| R03 | Uyumsuz hook/protokolde denetimsiz devam — kritik | Yüksek | Kanal kesilince yeni araç yok, sahip olunan süreç kapanır | Adapters; M1/M5 |
| R04 | Junction/TOCTOU/ortak Git metadata ile kapsam aşımı — kritik | Orta | Handle bazlı son yol ve olumsuz yarış testi; worktree izolasyon sayılmaz | Workspaces; M4 |
| R05 | Model/MCP/skill prompt enjeksiyonuyla yetki yükseltme — kritik | Yüksek | İşçi policy/approval değişmezliği, saldırı fixture'ları ve araç gate testi | Policy; M4/Faz 1.2 |
| R06 | Sağlayıcı fallback'iyle gizli veri başka bölgeye gider — kritik | Orta | Alt sağlayıcı/veri allowlist; bilinmeyende ret; redirect testi | Router/context; Faz 1.1/1.3 |
| R07 | API sırrı renderer/log/argv/çıktıya sızar — kritik | Orta | Kasa sınırı, sahte anahtar canary testleri, log incelemesi | Secret-vault; Faz 1.1 |
| R08 | Timeout/retry sonrası çift ücret/yan etki — yüksek | Yüksek | Belirsiz teslim ve rezervasyonu koruma; kör replay testi | Budget/adapters; M3/Faz 1.1 |
| R09 | Paralel çağrı rezervasyon yarışından bütçe aşımı — yüksek | Orta | Atomik görev/proje rezervasyonu; geç kullanım uzlaştırma | Storage/budget; Faz 1.1 |
| R10 | Ruflo ile çift scheduler/gizli alt ajan döngüsü — yüksek | Orta | Tek DAG otoritesi, ortak limitler ve çocuk durdurma; aksi halde plan modu | Coordinator; Faz 1.3 |
| R11 | Sahte veya eski test raporuyla yanlış başarı — yüksek | Yüksek | Hash'e bağlı QualityReport, bağımsız inceleme, insan kabulü | Quality; M5/Q1–Q6 |
| R12 | Disk dolması/DB bozulması/migration kesintisi — yüksek | Orta | Commit öncesi sevk yok; tutarlı yedek ve restore testi | Storage; M2/M7 |
| R13 | Native ABI/DACL/Job Object paketleme hatası — yüksek | Orta | Paketlenmiş Windows x64 testi; sürüm matrisi | Packaging; M1/M7 |
| R14 | 8 GB bellekte terminal/API/Ruflo süreç baskısı — yüksek | Yüksek | Ölçüm, bounded buffer, tek aktif görev, ileri uzantıların ertelenmesi | Performance; M7/Faz 1.3 |
| R15 | Model kalite puanının dar/yanlı evaluation'a uyması — orta | Yüksek | Sürümlü çeşitli görev kümesi, insan rubriği, öneri modunda deneme | Evaluation/router; Faz 1.3 |
| R16 | Lisans/sağlayıcı koşulları veya plugin kökeni belirsiz — yüksek | Orta | Güncel birincil kaynak, SBOM/notice, paket/hizmet ayrı inceleme | Lisans sorumlusu; M7/her uzantı |
| R17 | Kapsam büyümesiyle güvenlik kapılarının ertelenmesi — yüksek | Yüksek | M1–M7 değişmez kabul şartı; ileri fazları erteleme | Ürün sorumlusu; her faz |
| R18 | Uyku/iptal sonrası “çalışıyor” veya geri alındı izlenimi — yüksek | Orta | Resume uzlaştırma, açık interrupted/belirsizlik, gerçek yaşam döngüsü testi | Worker/UI; M2/M7 |

Bütün R01–R18 şu anda açıktır; bu faz bunların testini yapmaz. CI'nin belge kontrolünden geçmesi Windows, sağlayıcı veya model kalitesi risklerini kapatmaz. Aynı kullanıcıya karşı mutlak izolasyon ve sağlayıcı faturasına kesin yerel tavan vaat edilmez.

## Açık sorular ve güvenli varsayılanlar

| Soru | Mevcut karar | Kapatacak kanıt / engellenen özellik |
|---|---|---|
| Hangi Claude/Codex sürümleri güvenli yönetilen Windows modunu sağlıyor? | Sürüm uydurulmaz, unknown | M1 gerçek protokol/sandbox; A3 kapalı |
| Hangi native launcher DACL ve Job Object gereksinimini karşılıyor? | Paket/ABI seçimi açık | Paketlenmiş yaşam döngüsü/erişim testi; güvenli arka plan yayını kapalı |
| NVIDIA/Gemini için hangi hizmet ve bölge kullanılacak? | Sabit hizmet/URL iddiası yok | Resmi sözleşme, veri koşulu ve yetkili smoke; API adaptörü kapalı |
| OpenRouter alt sağlayıcısı ve fallback veri politikası sabitlenebiliyor mu? | Hassas veri yönlendirilmez | Gerçek request/response ve koşul kanıtı; ilgili routing adayı elenir |
| Ruflo hangi taşıma ve çocuk kontrolünü sunuyor? | Plan önerisi tasarımı | Resmi protokol + stop/budget testi; otonom delegasyon kapalı |
| Kaç token/para yeterli? | Kullanıcı sonlu tavan seçer, fiyat sürümlenir | Evaluation ve gerçek kullanım; bilinmeyen fiyatlı otomasyon kapalı |
| Plugin paketinin bağımlılıkları ve güncellemesi güvenilir mi? | Keşif dışında çalıştırma yok | Köken/lisans/izin farkı; etkinleştirme kapalı |

Bu sorular Faz 0.5 belge yayınının ön koşulu değildir; uygulama yeteneklerinin ön koşuludur. Harcama, sağlayıcı hesabı, kişisel veri ve dağıtım haklarını değiştiren kararlar kullanıcıya aittir. Teknik seçenekler kontrollü araştırma ve ölçümle daraltılır.

## Kanıt kayıt standardı

Gelecekte her kanıt `evidenceId`, gereksinim/karar/risk kimliği, sürüm ve ortam, yetkilendirilmiş test kapsamı, komut/araç kimliği, zaman, çıkış kodu, artefakt hash'i, sonuç ve inceleyen içerir. Runtime sırrı, ham env ve kullanıcı auth'u kanıta alınmaz. Kanıtın doğruladığı ve doğrulamadığı iddialar birlikte yazılır.

Kritik yetenek için uyumluluk kaydı yalnız tarih geçmesiyle değil executable/model sürümü, protokol, politika, araç listesi veya ortam değişimiyle de geçersiz olur. Tekrar doğrulama tamamlanana kadar unknown kabul edilir. Hatalı adaptör karantinaya alınır; güvenlik kontrolü kapatılarak kullanılabilirlik sağlanmaz.

## Yayın kararı ve geri dönüş

Faz 0.5 kabulü: yalnız 08–12 eklenmiş, orijinal yedi dosya değişmemiş, yerel Markdown bağlantıları geçerli, kararlar/takvim/limitler uyumlu, PR kontrolleri başarısız değil ve main üzerinde on iki belge doğrulanmış olmalıdır. Güncel GitHub head SHA denetlenerek merge yapılır; zorunlu kontrol/inceleme atlanmaz. Gerçek commit SHA ve PR URL sonuç raporunda verilir; bu belgede önceden uydurulmaz.

Yazma reddedilirse dosyalar ve yerel commit korunur, engel raporlanır. Push kabulü PR veya merge kabulü değildir. Merge sonrası belge hatası bulunursa yeni düzeltme PR'ı veya açıkça yetkilendirilmiş revert tercih edilir; geçmişi force-push ile değiştirme yoktur. Belge yayınını geri almak, gelecekte kurulmuş uygulama veya dış sağlayıcı işlemlerini geri almaz.

Ürün yayını ayrı karardır: M1–M7 ve ilgili ileri faz kapıları, kritik risk kapatma kanıtı, lisans kontrolü ve insan kabulü gerekir. Faz 0.5'in tamamlanması bu koşulların sağlandığı anlamına gelmez.
