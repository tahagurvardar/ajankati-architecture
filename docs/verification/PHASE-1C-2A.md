# Faz 1C-2A — Windows süreç sahipliği

28 Ekim 2026. Kapsam: sabit zararsız tanılama süreçleri; gerçek Claude/Codex oturumu veya OS sandbox değil.

## Araştırma ve native karar

Kurulu `node-pty 1.1.0` kaynağında `src/win/conpty.cc:PtyConnect`, yalnız `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE` ile `CreateProcessW` çağırır; `CREATE_SUSPENDED`, Job Object parametresi veya resume öncesi hook yoktur. JS'ye dönen çalışan PID'yi sonradan işe bağlamak, genel CLI için yarışsız değildir. Paketli ConPTY taşıması korunur (`useConptyDll: true`); PID enumerate edip öldüren sistem backend'ine geçilmedi.

Seçim: worker'da küçük C++ Node-API sahiplik modülü ve **yalnız sabit tanılama hedefini** açan güvenilir native bootstrap. node-pty fork'u veya bütün ConPTY I/O'sunu yeniden yazma gerekmedi. Yeni üretim npm bağımlılığı yok; `node-gyp 13.1.0` yalnız geliştirme bağımlılığıdır. Yerel araçlar: MSVC 14.51 / Visual Studio Build Tools 18.11, Windows SDK 10.0.26100.0, Python 3.13.15, Node 24.20.0; Electron 45.0.0. Sistem geneline kurulum/ayar değişimi yapılmadı.

1. Worker rastgele UUID adlı `Local\\AjanKati-…` job oluşturur. Var olan ad reddedilir. Non-inheritable handle üzerinde `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` ayarlanamazsa başlatma durur; breakaway bayrağı yoktur.
2. node-pty **güvenilir sabit bootstrap'ı** çalışır durumda başlatır. Bootstrap'ın kendi oluşturulması atomik job association değildir. Ancak işe katılmadan hiçbir alt süreç oluşturamaz; yalnız job adını kabul eder. Renderer yol, executable, argüman veya env belirleyemez.
3. Bootstrap job'ı geçici açar, kendisini ilişkilendirir. Hedef executable ve script, kendi modül konumundan sabit seçilir; PATH/shell yoktur. Hedef `CREATE_SUSPENDED` ve `PROC_THREAD_ATTRIBUTE_JOB_LIST` ile oluşturulur. `IsProcessInJob` doğrulaması gerekir.
4. Bootstrap geçici job handle'ını **resume öncesinde** kapatır. Böylece çalışan hedefler job handle'ı tutmaz; worker tek kalıcı handle sahibidir. Worker ara aşamada ölürse gate devam ettiğinde geçici referansı kapatır; hiçbir hedef kodu job dışında resume edilmez. Bootstrap'ın Windows API çağrılarının sonsuza kadar takılmasına karşı genel availability garantisi verilmez.
5. Thread handle resume sonrası, hedef process handle bekleme sonrası kapanır. Başlatma hatasında yalnız bu `CreateProcessW` çağrısının handle'ına sonlandırma uygulanabilir. Worker yalnız kendi job handle'ını sonlandırır; PID aramasıyla öldürme yoktur. Üye PID/executable listesi yalnız sınırlı tanılama kanıtıdır, kalıcı süreç kimliği değildir.

Başarı yanıtı sabit hedefin READY çıktısı ve job accounting kontrolünden sonra gelir. Tek aktif grup, 5 dakika worker deadline, önce 2 saniye Ctrl+C ve sonra job termination uygulanır. `ActiveProcesses == 0` ve PTY exit doğrulanmadan `exited` bildirilmez. Doğal kök çıkışı da geride kalan çocukları temizler. Query/terminate/close başarısızlığında kill-on-close denenir, başarı uydurulmaz ve host yeniden başlatmayı reddeder.

Microsoft dayanakları: [Job Objects ve çocuk üyeliği](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [JOB_LIST oluşturma özelliği](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute), [CREATE_SUSPENDED](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags). Job Object dosya/ağ erişimini sınırlamaz; aynı kullanıcı saldırganına, WMI gibi dış süreç broker'larına veya yetkili başka bir sürecin job handle'ını açık tutmasına karşı sandbox iddiası yoktur.

## Gerçek Windows kanıtı

Windows x64 `10.0.26300`. `:tree`: `diagnostic_bootstrap.exe` → `terminal-node.exe / safe-echo.cjs` → sabit branch → sabit leaf. İki ek `conhost.exe` de Windows tarafından job'a eklendi. Çocuk/torunda worker PID watchdog'u yok; fixture'ın acil ömür sınırı 5 dakikadır, temizlik assertion'ları 8 saniyeyi aşmaz.

Örnek yerel ölçüm (23:05 koşusu): normal kapanışta job üyeleri bootstrap **22704**, Node süreçleri **18044/20572/20552**, conhost **21000/23096**; altı üyenin tamamı kapandı ve native accounting **0** oldu. Zorla kapanışta bootstrap **11644**, Node **5800/9848/2340**, conhost **13912/6976** için de sonuç 0. Timeout ve doğal kök çıkışı ayrıca aynı canlı ağaçla sınandı. Worker zorla öldürüldüğünde bootstrap **21944**, branch **18528**, leaf **21992** kapandı. Bunlar o koşuya ait gözlemlerdir; tekrar çalıştırmada PID'ler değişir.

Testler ayrıca gerçek Windows active-process limit 0 ile association reddini, limit 1 ile hedef oluşturma reddini, native job adı çakışmasını ve geçersiz job adını sınar. Query/terminate/close hataları gerçek canlı ağaç üzerinde TypeScript bağımlılık enjeksiyonuyla üretilir; bu üç hata gerçek kernel arızası olarak sunulmaz. Host kapanış başarısı vermez ve yeni grubu reddeder.

Başlangıç çökme testleri için ayrı `_test` native ikilileri derlenir; üretim dist'e kopyalanmaz. Test gate'i before-open, after-open, after-association, suspended ve before-resume noktalarında owner'ın process handle'ının sinyalini bekler. Owner ölmeden checkpoint ilerlemez. Bu test bariyeri üretim watchdog'u değildir. Askıdaki hedefin üyeliği gözlenir; READY oluşmadan owner öldürülür ve gözlenen üyelerin yokluğu kontrol edilir.

## Doğrulama ve sınırlar

| Kontrol | Yerel sonuç |
|---|---|
| `pnpm verify` | Lint, typecheck, MSVC native build, renderer build; 14 dosyada **74/74 test** geçti (23:14 koşusu, test süresi 57,70 sn) |
| `pnpm audit --prod` | Bilinen güvenlik açığı bulunmadı |
| `pnpm test:desktop` | Sandbox açık Electron, Türkçe xterm/Ctrl+C, gezinme, SQLite demo/insan kabulü ve gerçek nested-tree temizliği geçti; branch **10516**, leaf **13556** kapandı |
| Kod incelemesi | İki yaşam döngüsü düzeltmesi ve test bariyeri güçlendirmesi sonrası dar sabit tanılama kapsamında açık engel yok |

GitHub CI sonuçları PR üzerinde ayrıca izlenir; yerel Windows sonucu Linux veya farklı Windows sürümü kanıtı sayılmaz.

İlk test, eski safe-echo'nun `:tree` metnini yalnız yankıladığını göstererek kırmızı oldu. Yeni native testlerde önce 4 yerine 6 üye görüldü; gerçek conhost üyeleri kaydedilip tüm üyeler için kapanış doğrulaması eklendi. Test addon'unun ikinci argümanı ilk turda N-API sayı denetimine takıldı; yalnız test derlemesinde düzeltildi. İncelemede restart/stop yarışı ve erken cleanup hata yolu düzeltildi. Electron başlangıç testi, artık hazır olmadan başarı dönmeyen launch için daha uzun sınırlı bekleme kullanır. Sonraki Electron turu `ECHO:[?1;2cMerhaba` gösterdi: gecikmeli ConPTY yetenek yanıtı ilk satıra karışıyordu. Sabit tanılama programı artık parçalı/bounded VT kontrol yanıtlarını satır metninden ayırır; gerçek ConPTY testine parçalı CSI yanıtı eklendi. Main yalnız terminal start için 20 sn cevap bütçesi kullanır; worker'ın 10 sn başlangıç sınırı ve hata temizliği bunun içindedir.

Kaynak maliyeti: tek worker-owned job, bir küçük native bootstrap ve mevcut Node tanılaması; bootstrap `WaitForSingleObject` ile bloklanır, busy-loop yoktur. Job accounting yalnız başlangıç/kapanışta sorgulanır; normal oturumda yeni periyodik native polling yoktur. Test ağacı yalnız `:tree` ile bir kez açılır. RAM/60 saniye CPU/8 GB hedefi ölçülmüş değildir. Mevcut Vite 500 kB uyarısı sürer (~574 kB renderer).

SQLite şeması/appData yolu, demo görevleri, CLI keşfi ve açık `--version` onayları değişmedi. Sürüm kontrolü hâlâ eski doğrudan-child sınırına sahiptir; bu milestone onun süreç ağacını kanıtlamaz. `.serena` ve tasarım asılları korunur; credential/config okunmaz, paid AI çağrısı yoktur.

Faz 1C-2B'nin kontrollü geliştirmesine temel sağlar; gerçek ajan enablement yetkisi sağlamaz. Önce sabit bootstrap'ın onaylı executable kimliğine güvenli genişletilmesi, provider argv/cwd/env ve onay sınırı, gerçek CLI çocuk/iptal/çökme testleri ve paketlenmiş runtime doğrulaması gerekir. Genel otonomi, dosya/ağ sandbox'ı, DACL, uyku/uyanma ve imzalı dağıtım kapıları açık kalır.
