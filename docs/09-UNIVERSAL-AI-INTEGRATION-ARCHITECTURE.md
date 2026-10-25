# AjanKatı — Evrensel AI Entegrasyon Mimarisi

Tarih: 24 Ekim 2026. Durum: Faz 0.5 normatif tasarım eki; uygulanmadı. Temel: [02](02-ARCHITECTURE.md), [03](03-AGENT-ADAPTERS.md), [04](04-SECURITY-MODEL.md). Karar önceliği [12](12-ARCHITECTURAL-RISKS-AND-DECISIONS.md) içindedir.

## Amaç ve katmanlar

Geliştirme merkezi; hedefi görevlere ayırır, uygun yürütücüyü seçer, bağlamı sınırlar, araç yetkisini denetler ve kanıtlı teslimi insana sunar. Model erişimi, araç erişimi ve orkestrasyon ayrı sorumluluklardır. Aşağıdaki akış mantıksal görünümüdür; henüz paket veya ağ servisi kurulmamıştır.

```text
Türkçe masaüstü → kimliği doğrulanmış yerel pipe → kullanıcı oturumu işçisi
  İşçi: DAG + politika + bütçe + kalite kapıları + SQLite/outbox
    ├─ CLI adaptörleri → ConPTY → Claude Code / Codex CLI
    ├─ Model adaptörleri → izinli HTTPS → NVIDIA / OpenRouter / Gemini
    ├─ Araç aracısı → izinli MCP araçları
    └─ Delegasyon adaptörü → isteğe bağlı Ruflo plan/alt görev önerileri
  Skill/plugin kayıtları → seçili içerik/sürüm → yetki denetimli oturum katmanı
```

Renderer anahtar, shell, MCP istemcisi veya model SDK'sı taşımaz. API çağrıları işçinin model adaptöründe, araç icrası ayrı araç aracısında yapılır. İşçi varsayılan HTTP dinleyicisi açmaz; dış HTTPS istemcisi olmak yerel sunucu açmak değildir. API yanıtı PTY olayı gibi sunulmaz; gerçek CLI terminalleri korunur.

## Entegrasyon türleri ve kayıt defteri

| Tür | Sorumluluk | Yetki sınırı |
|---|---|---|
| `cli-agent` | Kurulu ajanı gerçek PTY ve doğrulanmış yönetilen kanal ile kullanma | CLI kendi auth'unun sahibi; süreç ve sandbox kanıtı gerekir |
| `model-api` | Metin/struktur/araç çağrısı önerisi üretme | Model yanıtı yerelde araç çalıştırmaz |
| `mcp-server` | Adlandırılmış araçları sunma | Her araç/hedef ayrıca yetkilendirilir |
| `skill` | Göreve seçilerek eklenen yöntem/talimat | Talimat politika veya insan onayı üretemez |
| `plugin` | Bir veya daha çok araç/skill/adaptör paketi | Paket üyeleri toplu sınırsız yetki kazanmaz |
| `orchestrator-extension` | Plan ve alt görev önerisi, sınırlı delegasyon | AjanKatı tek scheduler ve DB sahibi kalır |

IntegrationRecord alanları: `integrationId`, tür, kaynak kapsamı, sürüm veya içerik hash'i, uyumluluk kanıtı, izin gereksinimleri, güven durumu ve son doğrulama zamanı. `discovered`, `verified`, `enabled`, `quarantined` ayrı durumlardır. Etkinlik proje/run kapsamlıdır; bulunmak etkinleşmek değildir. Üstveri keşfi komut/env/token veya SKILL.md gövdesi toplamaz.

Yetenek değeri `verified`, `unsupported` veya `unknown` olur; kanıtın sürümü, OS'si, taşıması ve tarihi tutulur. Ağ erişimi veya sağlık testi kullanıcıca yetkilendirilmiş etkinleştirme adımıdır. Ağdan dinamik gelen katalog yetenek kaydını kendiliğinden doğrulayamaz.

## Sözleşmeler

Aşağıdaki kayıtlar gelecekte sürümlü şemaya dönüştürülecek tasarım sözleşmeleridir. Bilinmeyen kritik alan/sürüm reddedilir; sınırlar çekirdekte tekrar uygulanır.

| Kayıt | Zorunlu içerik | Tüketen |
|---|---|---|
| TaskEnvelope | proje/görev/revizyon, kabul ölçütü, izinli araçlar, veri sınıfı, süre/deneme/bütçe, artefakt girdileri | Scheduler ve bütün yürütücüler |
| ContextBundle | seçilen dosya/özet referansları, hash/base commit, güven kaynağı, veri sınıfı, boyut/token sınırı | Bağlam oluşturucu ve adaptör |
| ExecutionRequest | task/run/epoch, adapter/model sürümü, ContextBundle hash'i, policyVersion, idempotencyKey, rezervasyon kimliği | CLI veya model adaptörü |
| ExecutionResult | sonuç sınıfı, artefakt referansları, sağlayıcı request/session kimliği, kullanım kaynağı, hata/iptal/belirsizlik | İşçi; doğrudan başarı geçişi yapmaz |
| ToolProposal | araç kimliği, şema sürümü, argüman özeti/hash, hedef, beklenen yan etki | Politika ve onay aracısı |
| RouteDecision | adaylar, ret nedenleri, seçilen model/sağlayıcı/uç nokta, puan sürümü, veri ve bütçe kontrolü | Denetim kaydı ve UI |

Model adaptörü işlemleri: `describeCompatibility`, `estimate`, `prepareRequest`, `invoke`, `cancel`, `normalizeUsage`. CLI sözleşmesindeki `start/sendTask/interrupt/resume` [03](03-AGENT-ADAPTERS.md) içinde kalır. `estimate` yan etkisiz yerel tahmindir; sağlayıcıya deneme isteği göndermez. `cancel` yeni yerel yan etkiyi keser, uzaktaki işlemi veya ücreti geri almayı garanti etmez.

API yetenekleri ayrı kaydedilir: `streaming`, `structuredOutput`, `toolProposal`, `contextLimit`, `maxOutput`, `usageReporting`, `requestCancellation`, `dataRegion`. Aynı OpenAI uyumlu HTTP biçimi bunların eşit olduğu anlamına gelmez. Streaming parçaları boyut sınırlıdır; eksik veya bozuk araç argümanı çalıştırılmaz.

## Sağlayıcı sınırları

| Entegrasyon | İlk mimari yaklaşım | Doğrulanması gerekenler |
|---|---|---|
| Claude Code | Birincil CLI adaptörü | Windows olay/izin/sandbox ve oturum katmanı |
| Codex CLI | Birincil CLI adaptörü | Aynı kapılar, sağlayıcıya özgü protokol |
| NVIDIA | Uzak model API adaptörü; seçilen hizmet/uç nokta açık kaydedilir | Auth, model kataloğu, veri politikası, araç/JSON desteği, kota |
| OpenRouter | Aracı sağlayıcı adaptörü; model ve mümkünse gerçek alt sağlayıcı birlikte kaydedilir | Alt sağlayıcı sabitleme, fallback, gizlilik, fiyat ve kullanım |
| Gemini | Doğrulanan API yüzeyine özel adaptör | Seçilen hizmetin auth/region/şema/kullanım farkları |
| Ruflo | İsteğe bağlı orkestratör uzantısı; varsa MCP taşıması ayrıca doğrulanır | Gerçek protokol, iç içe ajanlar, bütçe ve durdurma aktarımı |

NVIDIA kullanımı yerel GPU'da model çalıştırma şartı getirmez. Yerel NIM/model barındırma ayrı ileri fazdır. OpenRouter iç fallback'i veri politikasıyla sınırlandırılamıyorsa hassas iş ona yönlendirilmez. Gemini'nin farklı hizmet yüzeyleri tek auth varsayımıyla birleştirilmez. Bu belgede belirli güncel model, URL, bayrak veya fiyat vaat edilmez; resmi kaynak ve sözleşme testiyle sürüm sabitleme sonraki fazdadır.

## Akıllı yönlendirme

İlk MVP'de kullanıcı manuel rol/sağlayıcı seçer. Sonraki fazda deterministik yönlendirici, görev türü (planlama, kod, inceleme, test analizi), bağlam boyutu, yapılandırılmış çıktı ihtiyacı, veri sınıfı, kalan bütçe ve doğrulanmış başarı geçmişini kullanır.

1. Önce kesin filtreler: etkin entegrasyon, doğrulanmış gerekli yetenek, izinli veri bölgesi/sağlayıcı, geçerli sır, token sınırı ve bütçe rezervasyonu. Bilinmeyen zorunlu yetenek adaydan çıkarılır.
2. Kalan adaylara sürümlü puan: kalite %45, tahmini maliyet %25, gecikme %15, kullanılabilirlik %15. Bu oranlar ölçülmemiş başlangıç önerisidir; sabit evaluation kümesiyle kalibre edilir.
3. Soğuk başlangıçta kalite verisi uydurulmaz; kullanıcıca seçilen sabit öncelik uygulanır. Eşitlikte kararlı integrationId sırası kullanılır. Karar ve elenen adayların nedenleri içeriksiz üstveri olarak kaydedilir.
4. Kullanıcının model sabitlemesi korunur. Uygun aday yoksa `blocked`; hassas veri daha ucuz modele sessizce gönderilmez.

Fallback yalnız önceden izinli sağlayıcı/veri kapsamı ve kalan toplam deneme bütçesi içindedir. Yeni sağlayıcı veya veri bölgesi değişimi yeni onay ister. Zaman aşımı/bağlantı kesilmesinde önce teslim kesinliği değerlendirilir; belirsiz çağrı otomatik tekrarlanmaz. Rate limit için gecikmeli, jitter içeren bekleme görev süresinden sayılır. Uzak HTTP yönlendirmeleri allowlist dışına sır veya istem taşıyamaz.

## Bağlam, araçlar ve uzantılar

ContextBundle veri sınıfları: `local-only`, `restricted`, `shareable`. Varsayılan sınıf `local-only`; kullanıcı hangi dosya ve sağlayıcı için aktarım izni verdiğini görür. `restricted` yalnız belirlenen sağlayıcı/bölgeye, `shareable` yine görev kapsamıyla gönderilir. Hiçbir sınıf sırları otomatik paylaşma izni değildir. Büyük bağlamda kesme/özetleme açıkça gösterilir; farklı proje belleği varsayılan kapalıdır.

MCP yerel stdio süreci veya izinli uzak taşıma olabilir; gerçek destek kanıtlanır. Araç listesi alınması ayrı etkinleştirme iznidir. Liste değişirse capability snapshot geçersiz olur. Schema doğrulama, hedef/yol denetimi, süre ve çıktı boyutu sınırı her çağrıda uygulanır. MCP'nin sır kullanması modelin sırrı görmesini gerektirmez; sonuçta sır dönebilmesi ayrıca engellenmeli ve test edilmelidir.

Skill içerikleri açık seçimden sonra okunur, hash ile sabitlenir ve güvenilmeyen görev girdisi olarak eklenir. Plugin kurma/güncelleme MVP dışıdır. İleri fazda kaynak, lisans, bütünlük hash'i, bağımlılık ve istenen yetki farkı önizlenir; güncelleme yeniden onay ister. İmza veya popülerlik tek başına güvenlik kanıtı sayılmaz.

Ruflo delegasyonu tek TaskEnvelope altında kalan süre, deneme, devir ve rezervasyonu paylaşır. Alt görev önerileri döngü ve yetki genişlemesi açısından işçide denetlenir. Ruflo çocuklarını durdurma/gözleme kanıtı yoksa yalnız plan önerisi alınır; otonom delegasyon açılmaz. Ayrı scheduler DB'si veya gizli ajan havuzu ürünün doğruluk kaynağı yapılamaz.

## Sırlar ve kalıcılık

İlk CLI MVP'si anahtar kasası gerektirmez. API fazı, [04](04-SECURITY-MODEL.md) belgesindeki gelecekteki sır tasarımını açar: kullanıcı tarafından yeni ve açık sağlanan anahtar Windows Credential Manager/DPAPI tabanlı korumada, SQLite'ta yalnız secretRef. Mevcut CLI auth'u okunmaz/kopyalanmaz. Renderer, argv, istem ve teşhis günlüğü sır taşımaz. Kasadan çözme yalnız ilgili adaptöre ve istek ömrüne bağlıdır; iptal/rotasyon yeni çağrıları engeller.

SQLite'a yeni mantıksal kayıtlar önerilir: `integrations`, `capability_evidence`, `route_decisions`, `budget_reservations`, `tool_invocations`, `quality_reports`. Bunlar [02](02-ARCHITECTURE.md) tek yazıcı/transaction/outbox modeline eklenir; migration veya tablo şu anda oluşturulmaz. Şema değişiklikleri yedek ve kurtarma testi olmadan dağıtılmaz.

## Kabul kapıları

Her yeni adaptör ortak sözleşme testleri, sır sızıntısı/redirect testi, iptal ve belirsiz teslim testi, kullanım birleştirme testi ve yetkilendirilmiş gerçek smoke testi geçmelidir. Sahte sağlayıcıyla geçen test gerçek hizmet uyumluluğu sayılmaz. Her model sürümü için kanıt ayrı tutulur; başarısız entegrasyon karantinaya alınırken CLI çekirdeği kullanılabilir kalır. Sıra ve sahiplik [11](11-REVISED-MVP-ROADMAP.md), kalite ve bütçe kuralları [10](10-AUTONOMOUS-ORCHESTRATION-AND-QUALITY.md) içindedir.
