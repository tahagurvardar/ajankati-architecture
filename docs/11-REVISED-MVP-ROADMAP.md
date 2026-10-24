# AjanKatı — Revize MVP Yol Haritası

Tarih: 24 Ekim 2026. Durum: Faz 0.5 planı; uygulama işlerini başlatmaz. [05 — İlk plan](05-MVP-ROADMAP.md) korunur. M1–M7 adları aynı temel teslimleri ifade eder; aşağıdaki sıra ve genişleme sınırları yeni planlama temelidir.

## Hedef ve ürün sınırı

İlk ürün Windows 11 x64 üzerinde iki gerçek Claude Code/Codex CLI terminali, kalıcı görev/mesaj, insan onayı, güvenli durdurma ve açık tercihle pencere kapalı çalışma sunacaktır. Geniş vizyon, [09](09-UNIVERSAL-AI-INTEGRATION-ARCHITECTURE.md) sözleşmeleri üzerinden NVIDIA/OpenRouter/Gemini, MCP, skills, plugins, Ruflo ve akıllı yönlendirme eklemektir. Bunların hepsini ilk MVP'ye koymak teslim ve güvenlik riskini büyütür.

MVP'de API anahtar kasası, otomatik model seçimi, aktif Ruflo, aktif MCP/skill/plugin kurma ve marketplace yoktur. Üstveri envanteri vardır. Modül sınırları gelecekte bu türleri taşıyabilir; çalışmayan entegrasyon “destekleniyor” diye listelenmez. Docker/Python/GPU/WSL zorunlu değildir; uzaktan telefon erişimi Faz 2'de ayrı kalır.

## Fazlar ve bağımlılıklar

| Faz | Kapsam | Başlama kapısı | Çıkış |
|---|---|---|---|
| 0 | İlk yedi belge | Tarihsel kaynak incelemesi | Korunan 01–07 |
| 0.5 | Bu beş belge ve depo yayını | Yedi belgenin okunması | 08–12, bağlantı/tutarlılık incelemesi, PR ve main doğrulaması |
| 1 | Yerel iki CLI MVP, M1–M7 | Ayrı uygulama yetkisi ve Windows test ortamı | Kanıtlı yerel ürün adayı |
| 1.1 | API model altyapısı | M7 + sır/veri çıkışı tasarımı | Bir adaptörle doğrulanmış dikey akış, sonra diğerleri |
| 1.2 | MCP/skill/plugin etkinleştirme | Politika ve izolasyon kapıları | Seçili, sürüm sabitli uzantılar |
| 1.3 | Akıllı yönlendirme ve isteğe bağlı Ruflo | API/araç kanıtları ve evaluation kümesi | Bütçeli routing; ayrıca doğrulanmış delegasyon |
| 2 | Uzak erişim ve olası ileri ölçek | Yerel güvenlik/dayanıklılık kabulü | Ayrı tehdit modeli ve kullanıcı kararı |

Faz 1.2, API modellerine zorunlu bağımlı değildir; ancak ortak politika kapıları tamamlanmadan ilerlemez. Faz 1.3'te routing ile Ruflo ayrı açma kapılarıdır; biri başarılı diye diğeri etkinleşmez. Yerel model barındırma, çok kullanıcılı sunucu ve bulut senkronizasyonu bu planın taahhüdü değildir.

## Faz 0.5 teslim planı

Yalnız beş Markdown dosyası eklenir. 08 mevcut mimariyi eleştirir; 09 entegrasyon türleri ve routing sözleşmesini tanımlar; 10 otonomi/kalite/bütçe kurallarını belirler; bu belge teslim sırasını verir; 12 karar ve risk izini tutar. Ek uygulama paketi, test altyapısı veya global config oluşturulmaz.

Kabul: 01–07 blob kimlikleri başlangıç revizyonuyla aynı, bütün yerel Markdown hedefleri mevcut, beş dosya Türkçe ve birbiriyle uyumlu, diff yalnız beklenen eklemeleri içeriyor. PR başındaki GitHub kontrolleri ve merge uygunluğu incelenir; başarısız/pending zorunlu kontrol varsa merge yapılmaz. CI yokluğu testlerin geçtiği diye raporlanmaz. Merge sonrası main'den yeniden okunarak on iki dosya ve eski blob kimlikleri doğrulanır. Yazma reddinde yerel belgeler ve commit korunur; PR/merge yapılmış denmez.

## Faz 1 — Temel MVP kilometre taşları

Aşağıdaki sahipler gelecekteki modül sorumluluklarıdır, oluşturulmuş dosyalar değildir. [05](05-MVP-ROADMAP.md) içindeki ayrıntılı vakalar geçerlidir; ek kapılar [10](10-AUTONOMOUS-ORCHESTRATION-AND-QUALITY.md) ile uygulanır.

| Aşama | Sahip / teslim | Ön koşul | Kabul kanıtı |
|---|---|---|---|
| M1 — Uyumluluk | CLI adaptörleri, PTY ve native launcher | Yetkili test profili | İki gerçek CLI; Türkçe yol/girdi, `.cmd`, resize, Ctrl+C; DACL/Job Object, olay/izin/sandbox kanıtı |
| M2 — İşçi ve veri | Worker, contracts, storage | M1 yaşam döngüsü yaklaşımı | Tek DB yazıcısı, GUI bağımsızlığı, disk dolma/migration/çökme kurtarma |
| M3 — DAG ve teslim | Domain, scheduler, messages | M2 transaction/outbox | Döngü reddi, atomik lease, idempotency, belirsiz teslim, insan kabulü |
| M4 — Politika | Policy, approvals, git-workspaces | M1 izolasyon + M2/M3 kimlikleri | Onay replay/parametre değişimi, junction, kanal kaybı ve kirli worktree korunması |
| M5 — İki ajan | Coordinator ve CLI adaptörleri | M3 + M4 | Gerçek Claude→Codex ve ters rol devri; hash'e bağlı test/inceleme |
| M6 — Türkçe UI | Desktop, i18n, discovery | M2 olay sözleşmesi, M5 gerçek durumlar | Terminal/onay/görev ekranı, özgün ofis, erişilebilir metin görünümü, çalıştırmasız envanter |
| M7 — Ürün adayı | Paketleme, güvenlik, lisans, performans | M1–M6 | Paketlenmiş Windows E2E, iki donanım raporu, SBOM/notice ve açık kritik risk olmaması |

İzlenecek sıra M1 → M2 → M3 → M4 → M5 → M7'dir. M6'nın sunum işleri M2 sonrası yapılabilir; final kabul M5 gerçek durum akışına bağlıdır. Güvenlik, son aşamaya bırakılan tarama değil M1'den başlayan engelleyici kapıdır.

İlk tahmin 25–40 iş günü [05](05-MVP-ROADMAP.md) kaydından gelir; yeni kesin tarih değildir. M1 Windows/CLI/native sonuçları alınmadan API/Ruflo işleri için takvim sözü verilmez. Aşamalar harcanan günle değil kabul kanıtıyla kapanır.

## Faz 1.1 — API modelleri

Önce gelecekteki model-adapters, secret-vault, context ve budget modüllerinin sınırları yazılı sözleşmeye dönüştürülür. Bir sağlayıcı, resmi güncel protokol/koşul araştırması sonrası seçilir; NVIDIA/OpenRouter/Gemini için sıra şimdiden doğrulanmış varsayılmaz.

- [ ] Kontrollü sahte sağlayıcıyla malformed stream, araç şeması, timeout, 429, redirect ve iptal testleri.
- [ ] Windows kasa üzerinden yeni kullanıcı anahtarı; CLI auth ve global config'e dokunmama testi.
- [ ] Veri sınıfı ve sağlayıcı allowlist; ContextBundle önizlemesi ve boyut kontrolü.
- [ ] Atomik bütçe rezervasyonu, NULL kullanım ve geç gelen kullanım mutabakatı.
- [ ] Yetkilendirilmiş küçük gerçek çağrı; kullanılan hizmet/model/sürüm, maliyet kaynağı ve veri koşulu kanıtı.
- [ ] Aynı ortak sözleşmeyle diğer iki sağlayıcı; her biri ayrı kabul raporu.

Kabul: API yanıtı gerçek PTY gibi gösterilmez; model tool önerisi doğrudan çalıştırılmaz; izin dışı veri çıkışı ve sır sızıntısı testleri geçer. API çalışması ilk iki CLI'nin kaldırılmasına veya M1 kapısının atlanmasına gerekçe olmaz.

## Faz 1.2 — Araçlar ve içerik uzantıları

Sahipler: gelecekteki integration-registry, tool-broker, policy ve discovery. Salt okunur, dar kapsamlı bir MCP aracıyla başlanır. Yazma aracı ancak hedef/digest/onay/iptal testleri sonrası açılır. Skill kullanıcı seçimiyle okunur, hash'i sabitlenir; içerik keşif aşamasında toplanmaz. Plugin kaynak/lisans/izin farkı incelemesi tamamlanmadan kurulmaz.

Kabul: bulunan/uyumlu/etkin ayrımı UI'da görünür; araç listesi veya sürüm değişimi eski güveni geçersiz kılar; araç sonucu yeni yetki yaratamaz. Kaldırma/iptal çalışan çağrıya ilişkin belirsizliği kaydeder ve yeni çağrıyı engeller. Tek plugin içindeki bir yetki diğer araçlara yayılmaz.

## Faz 1.3 — Routing ve Ruflo

Routing önce yalnız öneri modunda değerlendirilir. Görev sınıfları için sürümlü küçük evaluation kümesi hazırlanır; kalite, gecikme ve maliyet kaynağı ölçülür. Politika filtresi puandan önce çalışır. Sabit model seçimi ve manuel geçersiz kılma görünürdür. Otomatik fallback toplam deneme bütçesi ve veri kapsamını aşamaz.

Ruflo önce plan önerisi adaptörüdür. Gerçek protokol, bağımlılık/lisans ve kaynak tüketimi araştırılır. Alt görevler AjanKatı DAG'ına önerilir; AjanKatı scheduler tek otoritedir. Otonom delegasyon için çocukların durdurulması, tekrarların tekilleştirilmesi, toplam bütçe ve 8 GB davranışı ayrıca kanıtlanır. Sağlanamazsa plan önerisi modunda kalır; ürün çekirdeği Ruflo gerektirmez.

## Çapraz test ve kaynak hedefleri

| Test sınıfı | Çalışacağı kapı | Başarısızlık kararı |
|---|---|---|
| Birim/sözleşme | M2–M5 ve her yeni adaptör | İlgili modül ilerlemez |
| Negatif güvenlik | M1/M4 ve her etkinleştirme | İlgili otonomi/yayın kapalı |
| Crash/disk/uyku | M2/M7, sonra API belirsizliği | Kör tekrar engellenmeden yayın yok |
| Gerçek sağlayıcı E2E | M5/M7 ve her API adaptörü | Fixture sonucu uyumluluk yerine sunulmaz |
| Model kalite evaluation'ı | Faz 1.3 | Routing öneri modunda kalır |
| Lisans/köken | M7, sonra her plugin/model hizmeti | Hak/koşul belirsiz içerik dağıtılmaz |

Kaynak hedefleri değişmez: uygulama boşta ajan/OS hariç ≤450 MiB private working set ve 60 saniye ortalama CPU <%3; Pixi 30/15 FPS, gizliyken kapalı; PTY 2 MiB ring, xterm 5.000 satır, istemci kuyruğu 256 KiB. Ryzen 5 5500U/8 GB ve Ryzen 5 3500X/16 GB matrisinde uygulama ile toplam sistem tüketimi ayrı ölçülür. Bunlar henüz elde edilmiş sonuç değildir.

## Yayın ve kapsam azaltma

MVP ürün yayını için M1–M7 kanıtları, insan kabulü, açık kritik güvenlik bulgusu olmaması ve dağıtım yetkisi gerekir. Uygulama kendiliğinden commit/push/merge yapmaz. Gelecekte PR otomasyonu eklenirse eylem kapsamı, branch/head SHA, kontrol durumu ve insan yetkisi bağlanır; zorunlu inceleme bypass edilmez.

Kaynak veya takvim baskısında önce dekor, karmaşık takvim, paralellik ve ileri entegrasyonlar ertelenir. İnsan onayı, kalıcılık, veri koruması, iki gerçek CLI ve güvenli durdurma çıkarılmaz. Windows sandbox kanıtı başarısızsa güvenli otonomi kapısı kapalı kalır; terminal demosu “tam MVP” diye yeniden adlandırılmaz.

Açık kararlar ve sahipleri [12 — Riskler ve kararlar](12-ARCHITECTURAL-RISKS-AND-DECISIONS.md) içinde tutulur. Faz 0.5 belgelerinin main'e alınması yalnız belge yayınıdır; bu planın uygulandığı anlamına gelmez.
