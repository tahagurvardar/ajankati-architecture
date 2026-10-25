# AjanKatı — Claude Merkezli Mimari Değerlendirmesi

Tarih: 24 Ekim 2026. Durum: Faz 0.5 tasarım değerlendirmesi; uygulama değildir. Başlangıç revizyonu: `01632df785d60ee06b1227f2fb111cdfc4848fc5`.

## Değerlendirmenin niteliği

Dosya adındaki Claude, incelenen entegrasyon odağıdır. Bu metin Claude tarafından yapılmış bağımsız bir denetim veya Anthropic onayı olarak sunulmaz. Değerlendirme, depodaki yedi mimari belgenin okunmasına dayanır; referans kaynak yeniden denetlenmedi, kurulu CLI çalıştırılmadı, sağlayıcı API'si çağrılmadı. Güncel model adları, fiyatlar, Windows sandbox desteği ve Ruflo protokolü doğrulanmış değildir.

Faz 0.5'in hedefi, iki terminali koordine eden uygulamayı genişletilebilir bir AI geliştirme merkezine dönüştürecek sözleşmeleri tanımlamaktır. Kullanıcı hedef, veri paylaşımı, harcama ve yayın yetkisinin sahibidir. Claude ve Codex rol alabilen yürütücülerdir; modeller ve eklentiler denetim düzleminin sahibi olmaz.

## Okunan kaynaklar ve bulgular

| Belge | Korunacak güçlü taraf | Faz 0.5'te tamamlanan boşluk |
|---|---|---|
| [01 — Kaynak denetimi](01-SOURCE-AUDIT.md) | Kaynakta bulunan davranış ile runtime kanıtı ayrılmış | Yeni ürün için kanıt kaydı ve sağlayıcıya özgü doğrulama zorunluluğu |
| [02 — Mimari](02-ARCHITECTURE.md) | UI'dan bağımsız işçi, tek veri sahibi, gerçek PTY | API modellerini PTY'den ayıran yürütme düzlemi |
| [03 — Adaptörler](03-AGENT-ADAPTERS.md) | Yetenek bazlı uyumluluk, global ayarlara dokunmama | Model, araç, skill, plugin ve orkestratör türlerinin ayrılması |
| [04 — Güvenlik](04-SECURITY-MODEL.md) | Varsayılan ret, kapsamlı onay, izolasyon kanıtı | Sağlayıcıya veri çıkışı ve API sırrı için ayrı sınır |
| [05 — Yol haritası](05-MVP-ROADMAP.md) | Önce Windows ve iki CLI kanıtı | Geniş vizyonu MVP'ye yığmadan aşamalı entegrasyon |
| [06 — Kararlar](06-TECHNICAL-DECISIONS.md) | K01–K19 ve sayısal kaynak hedefleri | Yeni kararlar için F05 kimlikleri ve değişiklik önceliği |
| [07 — Lisans](07-LICENSE-ASSESSMENT.md) | Kod, sanat, marka ve CLI koşulları ayrı | Model hizmeti, skill/plugin ve MCP dağıtım koşullarını ayrıca izleme |

Bu yedi belge tarihsel temel olarak aynen korunur. Faz 0.5 yeni bir çalışma kanıtı üretmez; gelecekte üretilecek kanıtın biçimini ve kapılarını tanımlar.

## Yaklaşım seçimi

Üç yol değerlendirildi. Claude'u tek üst yönetici yapmak hızlı başlangıç sağlar, ancak hook ve izin kavramlarını bütün sağlayıcılara taşır. Ruflo'yu çekirdek scheduler yapmak hazır koordinasyon sağlayabilir, fakat ikinci durum kaynağı, ek süreç yükü ve doğrulanmamış bağımlılık getirir. Seçilen tasarım önerisi, deterministik AjanKatı işçisini merkezde tutup her iki aracı da yetenekleri sınırlandırılmış adaptörler olarak kullanmaktır.

Bu seçim, Claude'un güçlü planlama veya kod üretme yeteneklerini engellemez. Model plan önerir; işçi DAG doğrulamasını, lease almayı, bütçe ayırmayı ve onay denetimini yapar. Yeni görev veya alt ajan talebi önce öneri kaydıdır. Model metni doğrudan süreç başlatamaz, DB durumunu değiştiremez veya başka sağlayıcıya veri gönderemez.

## Claude için özel inceleme

### Oturum ve izinler

Claude Code, mevcut kullanıcı girişini kendisi kullanır. AjanKatı auth dosyası okumaz, global trust/izin ayarını yazmaz, bypass bayrağını ürün varsayılanı yapmaz. Oturum katmanı mevcut kullanıcı MCP/skill ayarlarını güvenli allowlist ile sınırlandıramıyorsa yönetilen mod açılmaz. Etkileşimli terminal ayrıca sunulabilir; bu seçenek iki sağlayıcılı güvenli MVP kapısını geçmiş sayılmaz.

Hook alınabilmesi, hook'un bütün araçları engelleyebildiğinin kanıtı değildir. Uyumluluk kaydında olay gözleme, araç öncesi durdurma, onay cevabı, dosya izolasyonu ve ağ izolasyonu ayrı satırlardır. Sürüm veya executable değişince eski kanıt geçersiz olur. Windows'ta gerçek olumsuz test olmadan otonomi etiketi verilmez.

### Rol ve artefakt

Claude planlayıcı, uygulayıcı veya inceleyici olabilir; Codex aynı rolleri alabilir. Rol ataması ürünün sabit hiyerarşisi değildir. İnceleyici, uygulayıcının değiştirilebilir çalışma dizini yerine sabit base/diff/artefakt hash'ini alır. İnceleme sırasında yazma gerekirse ayrı kapsam ve yeni revizyon gerekir.

Claude'un “testler geçti” ifadesi bir iddiadır. Gerçek test komutu, ortam kimliği, çıkış kodu ve çıktı artefaktı farklı kayıtlardır. Başarı geçişi insan kabulüne bağlı kalır. Modelin kendi incelemesi yardımcı olabilir; bağımsız inceleme gereksiniminin yerine geçmez.

### Bağlam ve maliyet

Tüm depo, terminal geçmişi ve kullanıcı ayarlarını otomatik bağlama doldurmak yasaktır. Göreve göre seçilen dosyalar, kaynak revizyonu ve veri sınıfı ContextBundle içinde listelenir. Skill içeriği kullanıcı seçimi sonrası incelenebilir; keşif aşamasında özel istem gövdesi okunmaz. Özetin kaynağı korunur; eski model özeti doğrulanmış proje gerçeği sayılmaz.

CLI aboneliği, API kullanım hakkı veya belirli token maliyeti anlamına gelmez. Claude API için gelecekte ayrı hesap/izin ve sır kasası gerekir. Kullanım yoksa NULL tutulur; yönlendirici bunu ücretsiz seçenek diye puanlamaz.

## Öncelikli mimari düzeltmeler

| Öncelik | Öneri | Tamamlanma kanıtı |
|---|---|---|
| P0 | CLI, API modeli ve araç adaptörü ayrı türler olsun | PTY'siz API yanıtının terminal oturumu gibi gösterilmediği sözleşme testi |
| P0 | Tek scheduler ve tek politika otoritesi korunsun | Ruflo dahil dış planın DB veya onay atlayamadığı test |
| P0 | Model seçmeden önce veri/izin filtresi uygulansın | Yasak sağlayıcının hiçbir puanla aday olamadığı test |
| P0 | Test sonucu ile model beyanı ayrı olsun | Eksik/uyuşmayan artefaktın başarıyı engellemesi |
| P1 | Bütçe rezervasyonu proje/görev/deneme bazında tutulsun | Eşzamanlı iki isteğin aynı bakiyeyi harcayamaması |
| P1 | MCP ve plugin sürüm/içerik değişimi güveni düşürsün | Güncellemenin önceki izni devralmaması |
| P1 | API iptali ve belirsiz faturalama kayıtları ayrı olsun | İptalden sonra geç gelen kullanımın bütçeye işlenmesi |

## Kapsam ve uyumluluk kararı

Windows 11 x64, tek kullanıcı, yerel NTFS, TypeScript işçi ve Electron/React/PixiJS istemci korunur. Laptopta iki açık ajan, varsayılan tek aktif görev; 30 dakika görev süresi, en fazla 2 yeniden deneme ve 20 otomatik devir korunur. GPU, Docker, Python, Ruflo veya model sunucusu zorunlu değildir.

“Evrensel” ifadesi bütün sağlayıcıların bugün çalıştığı anlamına gelmez. Yeni yürütücünün çekirdeği değiştirmeden eklenebileceği sözleşme hedefidir. API yönlendirme ve aktif MCP/skill/plugin kullanımı MVP sonrası kontrollü genişlemedir; ilk MVP'nin iki gerçek CLI şartını kaldırmaz.

Normatif ekler [09 — Entegrasyon](09-UNIVERSAL-AI-INTEGRATION-ARCHITECTURE.md), [10 — Orkestrasyon ve kalite](10-AUTONOMOUS-ORCHESTRATION-AND-QUALITY.md), [11 — Revize yol haritası](11-REVISED-MVP-ROADMAP.md) ve [12 — Riskler ve kararlar](12-ARCHITECTURAL-RISKS-AND-DECISIONS.md) içindedir. Bu incelemenin kabulü belge kapsamının tamamlanmasıdır; uygulama veya sağlayıcı uyumluluğu onayı değildir.
