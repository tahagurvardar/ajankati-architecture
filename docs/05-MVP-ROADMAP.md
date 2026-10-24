# AjanKatı — İlk MVP Yol Haritası

Durum: Faz 0 planı; aşağıdaki geliştirme işleri yapılmadı. Bu planı yürütmek için ayrı uygulama aşaması gerekir. Kullanıcının bu fazdaki yetkisi yalnız mimari belgelerini kapsar; aşağıdaki test/kurulum/ajan çalıştırma maddeleri şu anda çalıştırılacak komut değildir.

**Amaç:** Windows 11 üzerinde mevcut Claude Code ve Codex CLI'yi gerçek terminallerle kullanan, iki ajan arasında kalıcı görev devri sağlayan ve açık kullanıcı izniyle pencere kapalıyken devam eden Türkçe uygulama.

**Mimari:** Electron/React/PixiJS istemcisi; ayrı kullanıcı oturumu işçisi; işçide node-pty, SQLite, adaptörler ve yetki politikası. İş durumu görsel ofisten bağımsızdır.

**Dayanak:** [Mimari](02-ARCHITECTURE.md), [adaptör sözleşmesi](03-AGENT-ADAPTERS.md), [güvenlik modeli](04-SECURITY-MODEL.md). Bunlar birlikte uygulanır. İleride ajanlı yürütme seçilirse uygun plan yürütme yöntemi ayrıca belirlenir; bu fazda dış ajan veya alt ajan çalıştırılmadı.

## Genel sınırlar

- Referans depo salt okunur; kaynak, sanat, karakter, harita ve marka kopyalanmaz.
- Global CLI/MCP/plugin yapılandırması değiştirilmez; mevcut kurulumlar kullanılır.
- İlk destek Windows 11 x64, yerel proje, tek kullanıcı ve iki ajan.
- Telefon/uzak bağlantı Faz 2; Docker/WSL, embedding, sesli kontrol, tam IDE, marketplace ve otomatik kurulum MVP dışı.
- Commit/push, merge, paket yükleme ve harici hizmete yazma bu planın varlığıyla yetkilendirilmiş olmaz.
- “Güvenli otonomi” yalnız kanıtlanmış sınırlı politika için kullanılır. Doğrulanamayan sağlayıcı özelliği ürün etiketiyle gizlenmez.

## İnceleme odağı

1. Windows `.cmd`/Unicode/çok satırlı görev aktarımı — M1.
2. GUI kapanması ile işçi/OS kapanmasının farklı sonucu — M2 ve M7.
3. Mesaj/yan etki çökme aralığında belirsiz teslim — M3 ve M5.
4. Junction yarışı, aynı kullanıcı süreçleri ve sandbox'ın gerçekte bulunmaması — M4.
5. 8 GB RAM, terminal flood ve kayıp GPU bağlamı — M6 ve M7.

## Kilometre taşları

Süreler tek deneyimli geliştirici için planlama tahmini; M1 sonucuna göre yeniden hesaplanır. Toplam yaklaşık 25–40 iş günü, güvenlik/native uyumsuzlukları hariç. Tarih veya performans taahhüdü değildir.

### M0 — Faz 0 belge teslimi

Çıktı: bu dizindeki yedi Türkçe belge. Kaynak–iddia matrisi, bağımsız tasarım, lisans sınırları ve kabul kapıları.

Kabul: yalnız `docs/*.md` oluşturulmuş; uygulama kaynak kodu, Git başlangıcı, paket veya config değişikliği yok. Faz 0 denetimi test çalıştırma veya runtime doğrulaması olarak sunulmaz.

### M1 — Windows ve iki CLI uyumluluk kanıtı (3–5 gün)

Gelecekteki sahiplik: `packages/adapters/{claude,codex}`, `packages/pty-host`, `tests/compatibility/windows-*`. Girdi: kullanıcının onayladığı CLI yolları ve ayrı test profili. Çıktı: her sağlayıcı/sürüm için capability matrisi ve güvenlik sınırlaması.

- [ ] Önce başarısız olacak sözleşme vakalarını tanımla: boşluklu/Türkçe yol, `.cmd`, `% ! &`, çok satır, login ihtiyacı, resize, Ctrl+C ve provider olay kaybı.
- [ ] Onaylı yerel yardım/sürüm kanıtıyla kesin başlatma ve olay protokolünü seç; global config gerektiren çözümü reddet.
- [ ] Gerçek PTY ve mevcut CLI girişini koruyan oturum ayarı kanıtını üret; güvenli fixture dışında özel istem/kullanıcı geçmişini okuma.
- [ ] Windows DACL, Job Object ve native ABI paketleme yöntemini kanıtla; worker/GUI sahipliği ayrımını test et.
- [ ] Kanıt tablosunda her yeteneği doğrulandı/desteklenmiyor/bilinmiyor işaretle.

**Kabul:** iki CLI de paketlenebilir PTY yolunda gerçek oturum açar; yönetilen olay/izin/sandbox yolu için somut kanıt vardır. Sürüm veya sandbox belirsizse yalnız terminal özelliği geçer, güvenli otonomi kapısı geçmez. M1'de gerçek model isteği gerekiyorsa sonraki fazda açık harcama yetkisi alınır; bu Faz 0'da yapılmaz.

### M2 — İşçi, yerel protokol ve tek veri sahibi (4–6 gün)

Gelecekteki sahiplik: `apps/worker`, `apps/desktop/main`, `apps/desktop/preload`, `packages/contracts`, `packages/storage`; `tests/integration/worker-lifecycle`, `storage-recovery`.

- [ ] Tek örnek, sahte IPC, GUI çökmesi, disk dolması ve migration kesintisi testlerini önce yaz.
- [ ] Mimari şemadaki durum + olay + outbox transaction'ını ve sürümlü IPC sınırını kur.
- [ ] İşçi GUI'den bağımsız çalışsın; mevcut örneğe yeniden bağlanma ve yetkili pencere kontrolünü uygula.
- [ ] Arka plan kapalıyken heartbeat kaybı/yeniden bağlanma süresini; açıkken penceresiz devamı ayrı test et.
- [ ] DB yedek/geri yükleme ve bozulmada güvenli hata davranışını doğrula.

**Kabul:** GUI kapanıp yeniden açıldığında aynı işçi ve görev kimlikleri korunur; ikinci işçi aynı DB'de iş yürütemez. Arka plan tercihi varsayılan kapalıdır. İşçi yeniden başlatıldığında eski koşular başarılı görünmez ve kör tekrar başlamaz.

### M3 — Görev DAG, kalıcı mesaj ve insan kabulü (4–6 gün)

Gelecekteki sahiplik: `packages/domain/tasks`, `packages/domain/messages`, `apps/worker/scheduler`; `tests/domain/dag`, `tests/integration/delivery-recovery`.

- [ ] Döngü, çapraz proje kenarı, eksik bağımlılık, eşzamanlı sahiplenme, yinelenen mesaj ve eski revizyon testlerini önce tanımla.
- [ ] Atomik lease/epoch, görev durum makinesi ve outbox üzerinden teslimi uygula.
- [ ] `delivery_uncertain` durumunu ve kullanıcıca yeniden sevk kararını ekle.
- [ ] Artefakt hash'i ve insan kabulüyle `awaiting_review → succeeded` geçişini bağla.
- [ ] Tek seferlik/aralıklı zamanlama, benzersiz vade ve kaçırılmış işi atlama davranışını doğrula.

**Kabul:** A başarıyla kabul edilmeden B sevk edilmez. Aynı görev iki işçi/istek tarafından iki kez sahiplenilemez. Agent'ın “bitti” mesajı tek başına başarı yaratmaz. Çökme sonrasında kalıcı mesajlar görünür ve teslim belirsizliği saklanır.

### M4 — Politika, onay ve güvenli proje alanı (4–7 gün)

Gelecekteki sahiplik: `packages/policy`, `packages/git-workspaces`, `apps/worker/approvals`; `tests/security/*`, `tests/integration/worktree-preservation`.

- [ ] Sahte/tekrar kullanılmış onay, parametre değişimi, junction yarışı, kanal kaybı ve kirli worktree senaryolarını önce yaz.
- [ ] İnsan onayını actionDigest/run/policyVersion/son kullanma süresine bağla; kullanımı atomik yap.
- [ ] Onaylı base commit üzerinden ayrı worktree ve kullanıcıya görünür değişiklik özeti oluştur.
- [ ] Global config, sır, ana çalışma ağacı ve diğer proje erişimini kontrollü sahte test profiliyle engelle.
- [ ] Acil durdurmada süreç ağacı kapansın; dosyalar ve worktree korunsun.
- [ ] Sağlayıcı OS sandbox'ını hem dosya hem ağ açısından kanıtla. Yalnız uygulama içi yol denetimini yeterli sayma.

**Kabul:** güvenlik tablosundaki kritik testlerin hepsi geçer; onay/izolasyon kaybında yeni yan etki yoktur. Worktree silme/merge/push otomatik değildir. Doğrulanmış sınır yoksa otonom mod açılmaz ve MVP yayımlama kapısı kapanır.

### M5 — Gerçek iki ajan koordinasyonu (3–5 gün)

Gelecekteki sahiplik: `apps/worker/coordinator`, adaptörlerin yönetilen görev yolu; `tests/e2e/two-agent-handoff`.

- [ ] Fixture testleriyle mesaj sıralaması, iki input sahibinin çakışması, gecikmiş çıkış ve farklı sağlayıcı olayları doğrulansın.
- [ ] Claude uygulayıcı, Codex inceleyici devri; ters rol devri de aynı ortak sözleşmeyle yürüsün.
- [ ] Ajan iş sonucu, test artefaktı ve kullanıcı kabulü ayrı kayıtlara dönüştürülsün.
- [ ] Süre/deneme/devir limitleri ve kullanım verisi yokluğu gerçek akışta sınansın.
- [ ] Sonraki fazda açık yetkiyle küçük, geçici bir örnek projede gerçek iki sağlayıcı testini yap; gerçek kullanıcının deposunu test malzemesi yapma.

**Kabul:** iki gerçek terminal, kalıcı iki yönlü mesaj, bağımlılık sırası, onay bekleme, iptal ve yeniden açınca durum devamlılığı kanıtlanır. Sabit demo yanıtı veya sentetik çalışma animasyonu kabul edilmez. Task tamamlanma süresi/model kalitesi deterministik test sonucu sayılmaz; yapısal koşullar ölçülür.

### M6 — Türkçe UI, özgün ofis ve entegrasyon envanteri (4–6 gün)

Gelecekteki sahiplik: `apps/desktop/renderer/{tasks,terminals,office,approvals,projects}`, `packages/i18n`, `packages/discovery`; `tests/ui/turkish`, `tests/security/discovery`, `tests/performance/idle`.

- [ ] Türkçe karakter, klavye odağı, erişilebilir metin alternatifi ve uzun dosya adı senaryolarını tanımla.
- [ ] Görev/terminal/mesaj/onay ekranlarını gerçek işçi snapshot/olay akışına bağla.
- [ ] Özgün iki masalı ofis; çalışıyor, bekliyor, hata ve bağlantı belirsiz durumlarını göster.
- [ ] Görünmez sahne ticker'ını kapat; GPU kaybında metin arayüzüne dön.
- [ ] Yalnız izinli üstveriden CLI/MCP/skill varlık envanteri; sır veya özel prompt okumadan bilinmeyen durumunu göster.
- [ ] Keşif sonucunun herhangi bir executable/MCP başlatmadığını test et.

**Kabul:** tüm uygulama talimatları ve hata durumları Türkçe; provider çıktısı olduğu gibi korunur. Ofis kapalıyken iş devam eder. Kullanıcı “bulundu” ile “etkin/uyumlu” ayrımını görür. Üçüncü taraf referans sanatı yoktur.

### M7 — Paketleme ve dayanıklılık kabulü (3–5 gün)

Gelecekteki sahiplik: paketleme belgeleri, `tests/e2e/lifecycle`, `tests/performance/windows`, lisans envanteri. İmzalama ve dağıtım ayrıca yetki gerektirir.

- [ ] Paketlenmiş x64 uygulamada node-pty/SQLite native yüklenmesini ve CLI yollarının değişmemesini doğrula.
- [ ] Pencere kapalı çalışma, uyku/uyanma, ekran kilidi, işçi çökmesi, OS yeniden başlatma, disk dolması ve güncelleme sırasında aktif görev senaryolarını çalıştır.
- [ ] Güncelleme aktif koşuyu kendiliğinden kesmesin; drain/backup ve kullanıcı kararı gereksinimini doğrula.
- [ ] Aşağıdaki donanım matrisiyle bellek/CPU/terminal gecikmesi ölç; başarısız hedefleri belgeleyip sınırı düzelt.
- [ ] Lisans/asset köken defteri ve dağıtımdaki notice dosyalarını incele; yalnız ana bağımlılık etiketine güvenme.

**Kabul:** iki cihazda rapor, kritik güvenlik testleri, gerçek iki sağlayıcı testi ve lisans kapısı tamamlanır. Uyku/güç kapalıyken çalışma iddiası UI, yardım ve tanıtımda bulunmaz. Tam uygulama geliştirilmeden bu maddeler işaretlenmez.

## Donanım doğrulama matrisi

| Ortam | Senaryo | Hedef / kanıt |
|---|---|---|
| Ryzen 5 5500U, 8 GB | Boşta, ofis açık; sonra pencere kapalı | Ajan/OS hariç uygulama private working set ≤450 MiB ve boşta CPU <%3 hedefi; süreç bazlı ölçüm, 60 sn örnek |
| Aynı laptop | İki gerçek CLI, tek aktif sonra iki aktif görev | Paging, serbest bellek, input gecikmesi ve toplam sistem RAM kaydı; kaynak yetersizse yeni görev bekler |
| Ryzen 5 3500X, 16 GB, RTX 2060 | İki aktif görev + ofis | GPU'ya bağımlı olmayan çalıştırma; CPU/RAM/terminal verisi |
| Her ikisi | 10 dk terminal flood; 30 kez sekme/pencere aç-kapat | Başlangıç tampon kotaları aşılmaz; canlı session sayısı sızmaz, bellek kalıcı olarak artmaz |
| Her ikisi | Pencere kapalı 30 dk; uyku/uyanma; işçi sonlandırma | Arka plan izni, kesinti ve belirsizlik doğru gösterilir; tekrar yan etki oluşmaz |
| Her ikisi | İki saat hafif görev/mesaj dayanıklılığı | Kayıp onay/görev yok; kayıt sayıları tutarlı; boşta kaynak tüketimi eski seviyeye döner |

Test yükü, CLI sürümü, Windows sürümü ve ölçüm yöntemi her raporda tutulur. Evrensel model gecikmesi SLA'sı konmaz. Ajan belleği ölçüme dahil edilerek toplam kullanım ayrıca gösterilir; uygulama hedefinden dışlanması kullanıcıya toplam RAM garantisi vermez.

## Riskler ve kapsam azaltma sırası

M1'in ana riski CLI sürümü/Windows sandbox farkıdır; çözüm denetimi atlamak değil adaptör kapsamını açık tutmaktır. Native DACL/Job Object ve paketleme gecikirse güvenli arka plan kapısı geçmez. 8 GB kaynak baskısında önce ofis efektleri, kalıcı terminal miktarı ve paralellik azaltılır; onay, kalıcılık veya kullanıcı verisi koruması kaldırılmaz.

MVP dışına bırakılabilecekler: zengin ofis dekorasyonu, haftalık karmaşık takvim, anlamsal bellek, tam IDE, marketplace, ses, otomatik model seçimi. Çıkarılamayacaklar: iki gerçek CLI desteği, gerçek terminaller, kalıcı görev/mesaj, güvenli durdurma, insan onayı, global ayarların korunması ve arka plan tercihinin doğruluğu.

## Faz 2 sınırı

Telefon erişimi ancak yerel MVP güvenlik ve dayanıklılık kapılarından sonra: ayrı kimlik/cihaz eşleme, iptal edilebilir oturum, TLS ve uzaktan onay tehdidi tasarımı. İlk MVP'ye gizli tünel, açık port veya “gelecekte lazım olur” diye uzak yönetim uç noktası eklenmez.
