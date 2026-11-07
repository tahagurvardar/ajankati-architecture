# M1.2 uygulama planı

Kapsam: Kullanıcının M1.2 şartnamesi. Gerçek CLI ve managed execution kapalıdır.
Mevcut worker başına sahiplik, native path sınırı ve Job Object korunur.

Seçilen tasarım: Main'e ait native folder picker ve native onay penceresi;
worker belleğinde en çok 16 workspace kaydı, tek 60 saniyelik hazırlık.
Renderer yalnız UUID ile çalışır. Proje DB kayıtları yetki sağlamaz.
Alternatif renderer path girişi güven sınırını ihlal eder; kalıcı workspace
izin deposu bu faz için gereksiz yeniden bağlanma ve eski kimlik riski yaratır.

1. Strict renderer/worker komut ayrımı ve workspace kimliği testleri.
2. Native snapshot'a bağlı worker kaydı; hazırlık/onay sonunda yeniden kontrol,
   süre ve stop yarışlarının kapatılması.
3. Main/preload dar köprü, native diyalog, varsayılan iptal ve owner epoch kontrolü.
4. WorkerClient protokol eşleştirme, boyut sınırı, disconnect/timeout zehirleme.
5. Offline host, gerçek worker IPC ve main köprü testleri; mevcut ConPTY/Job
   fixture regresyonları. Native vakalar win32, model testleri platform bağımsız.
6. Frozen install, verify, provider sürüm probe kapalı desktop smoke, prod audit,
   diff check; Türkçe rapor, commit/push ve main hedefli PR. Merge yok.

İnceleme odağı: picker sırasında owner ölümü, geç diyalog onayı, registration
sonrası dizin replacement, eşzamanlı onay, yanlış protokollü yanıt ve timeout
sonrası replay. Hiçbiri canlı başlatmaya dönüşemez.
