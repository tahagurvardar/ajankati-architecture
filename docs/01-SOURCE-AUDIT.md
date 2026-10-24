# AjanKatı — Faz 0: Kaynak Denetimi

Tarih: 24 Ekim 2026. İncelenen kök: `D:\dev\video-tools\munder-difflin-source`.

## Kapsam ve kanıt standardı

Bu çalışma yerel kaynakların statik incelemesidir. Uygulama, testler, CLI ajanları, paket betikleri ve MCP sunucuları çalıştırılmadı; ağ/API isteği gönderilmedi. Kullanıcının gerçek CLI ayarları, kimlik bilgileri, oturum günlükleri, özel istemleri ve referansın çalışma verileri okunmadı. `src`, seçili `test` dosyaları, proje belgeleri, paket bildirimleri ve lisans metinleri incelendi. `hive/`, `.claude/`, kullanıcı ana dizinindeki yapılandırmalar ve `.env` içerikleri kapsam dışıdır.

“Uygulanmış” aşağıda kod yolunun bulunduğunu ifade eder; çalıştığı, güvenli olduğu veya tüm sağlayıcılarda doğrulandığı anlamına gelmez. Test dosyasının bulunması testin geçtiği anlamına gelmez. Satır numaraları bu yerel kopyaya aittir; belirtilen başlangıç satırı ve sembol birlikte kullanılmalıdır.

- Git HEAD: `4d30bc47a7927c72e6786a62ce536ad194df166b`. Çalışma ağacının HEAD ile aynı olduğu varsayılmadı.
- `package.json` sürümü: `0.4.6`. README: “v0.5.6'ya kadar yayımlandı” iddiası (`README.md:485`). Bunlar tutarsızdır; README yerel uygulamanın özellik envanteri olarak kabul edilmedi.
- Bağımlılık aralıkları kurulu sürüm değildir: örneğin bildirimde Electron `^32.2.0`, yerel paket üstverisinde `32.3.3`; PixiJS `^8.5.1` karşısında `8.18.1` bulunuyor. Bunlar AjanKatı için sürüm önerisi değildir.

## Gerçek çalışma mimarisi

Electron ana süreç PTY, pencere, IPC, dosya/Git işlemleri, hook sunucusu, zamanlama ve entegrasyonları yönetiyor. Preload, React tarafına `window.cth` üzerinden yöntemler açıyor. React/Zustand arayüzü hem sunum hem bazı koordinasyon döngülerini yürütüyor. PixiJS ofis ve xterm terminalleri bu arayüzün içinde. Mesajlar, görevler ve bellek büyük ölçüde dosyalarda; SQLite sınırlı bir rol oynuyor.

| Alan | Durum | Kaynak kanıtı ve sınır |
|---|---|---|
| Electron ana süreç | Uygulanmış | `src/main/index.ts:2306` / `createWindow`; dosya 5.511 satır. PTY, zamanlayıcı ve çok sayıda IPC aynı modülde. |
| Preload | Uygulanmış | `src/preload/index.ts:568` ve `:583`: sürüm bilgisi ve adlandırılmış PTY çağrıları. Dosya 1.431 satır; TypeScript sözleşmesi tek başına çalışma zamanı yetkilendirmesi değildir. |
| React arayüz | Uygulanmış | `src/renderer/src/App.tsx:194` / `useHive`; `store/store.ts:455` ve `:578`: ajan ve kuyrukların localStorage'a yazılması. Dosya/roster aynası da var. |
| PixiJS ofis | Uygulanmış | `scene/office/OfficeFloor.tsx:234` / `Application`, `:1683` / ticker. Karakter, kamera, yol bulma, harita ve mesaj animasyonları ayrı modüllerde. Görünmezken ticker durdurma mevcut (`:223`). |
| Gerçek terminaller | Uygulanmış | `src/main/pty.ts:664`: `node-pty.spawn`; `:695`: veri olayları; `:707`: çıkış; `:774`: sonlandırma. Renderer `components/terminalPool.ts:132`: xterm. |
| Windows CLI çalıştırma | Uygulanmış, sürüme duyarlı | `pty.ts:227` / `parseNpmCmdShim`, `:552` / `spawn`: npm `.cmd` yönlendiricisini çözerek gerçek yorumlayıcıyı kullanma; çözülemezse cmd yolu. Alıntılama ve çok satırlı argüman kaybı için özel kod bulunuyor. |
| Sağlayıcılar | Uygulanmış, eşit yetenek yok | `src/shared/agentProvider.ts:172` Claude, `:197` Codex ve başka hazır tanımlar. Hook, eklenti ve proxy türleri farklı; ortak preset bulunması eşit gözlemlenebilirlik/izin garantisi değildir. |
| Ajan iletişimi | Uygulanmış | `src/main/hive.ts:69` / `HiveMessage`; `:1832` / `startRouter`: 1.500 ms aralıkla outbox→inbox yönlendirmesi, `.sent` arşivi ve hatalı JSON karantinası. `:1880` gönderici klasörden belirleniyor. |
| Görevler ve insan soruları | Kısmen uygulanmış | `hive.ts:119` / `HiveTask`: durum, atanan ajan, `dependsOn`, `humanQA`. `:1911` görev defteri kalıcılığı; `TasksKanban.tsx:95` bağımlılık normalizasyonu. İncelenen yönetim yolunda atomik görev sahiplenme, DAG döngü reddi ve bağımlılık tamamlanmadan çalıştırmayı zorunlu engelleyen merkezi motor saptanmadı. |
| İşçi oluşturma | Uygulanmış | `index.ts:4689` / `processSpawnRequest`: dosya isteğinden geçici işçi; `workerLaunch.ts` komut/sağlayıcı seçimi; `workerWake.ts:254` güvenli uyandırma kontrolleri. Bunlar Electron'dan bağımsız kalıcı hizmet değildir. |
| Kalıcılık | Kısmen uygulanmış | `db.ts:49`: yalnızca `kv` ve `command_history` şeması; WAL mevcut. Görev/mesajların SQLite'a taşınması yapılmış görünmüyor. `db.ts:36` ajan/kuyruk ve maliyet defteri göçlerini gelecek iş olarak açıkça ayırıyor. |
| Bellek | Uygulanmış, isteğe bağlı altyapı | `hive.ts:766`: ajan Markdown belleği; `memory.ts:1`: MemPalace CLI sarmalayıcısı, kurulu değilse anlamsal arama yok; `:289` seri madencilik. `reflect.ts` bellek özetleme, `knowledge.ts`/`kg-core.cjs` dosya tabanlı bilgi grafiği içeriyor. |
| Bellek grafiği arayüzü | Uygulanmış | `components/MemoryGraphPanel.tsx:23`; `CommandCenterPanel.tsx:331` gerçek kullanım. `MEMORY_GRAPH_SPEC.md:4` “henüz kod yok” ifadesi güncelliğini yitirmiş. |
| MCP | Uygulanmış, katalog odaklı | `hive.ts:1318` / `buildDefaultMcpServers`: katalog, onay ve cwd tabanlı sunucu ayarları; yazma/sır kullananlar açık onay gerektiriyor. Genel ve sağlayıcılar arası eksiksiz keşif kanıtlanmadı. |
| Skill/eklenti keşfi | Uygulanmış, sınırlı kapsam | `skills.ts:131`: belirli Claude, Codex ve OpenCode klasörleri; `:221`, `:398`, `:496`: uzak katalog ve kur/kaldır yolları da var. AjanKatı MVP'si kurulum işlemlerini kapsamayacak. |
| Yaşam döngüsü hook'ları | Uygulanmış | `hooks.ts:223` soket sunucusu; `:278` sınırlı JSON çerçevesi; `:502` PreToolUse reddi. `hive.ts:1297` Claude ayarları; `:2194` Codex'e özel kurulum. Sağlayıcı olayları Claude biçimine yaklaştırılıyor. |
| İnsan denetimi | Uygulanmış, hook'a bağlı | `control.ts`, `hooks.ts:506`: duraklatma/araç reddi; `index.ts:3962` ve `:3995`: duraklat/durdur IPC. Hook yokluğunda aynı güvenceler varsayılamaz. |
| Kullanım/maliyet | Uygulanmış, kapsama bağlı | `telemetry.ts:305`: Claude OTel ölçümleri; `transcript.ts`: oturum bazlı geri dönüş; `costLifetime.ts`, `pricing.ts`, `breaker.ts`: toplama ve politika. `breaker.ts:56` ölçüm yoksa bazı maliyet/hız kontrolleri atlanıyor. Evrensel fatura doğruluğu yok. |
| Zamanlama | Uygulanmış | `index.ts:700` / `syncMissions`, `:761` haftalık hesap, `:1332` adaptif heartbeat; son çalıştırma bilgisi config'e yazılıyor. Pencere ve uygulama yaşam döngüsünden bağımsız bir dayanıklı iş kuyruğu değil. |
| Uyku/uyanma | Uygulanmış destek | `index.ts:647` keep-awake seçenekleri; `:5424` resume/unlock, `:5426` suspend olayları. Güç engelleyici bilgisayar kapalıyken çalışma sağlamaz. |
| Pencere kapanınca Windows'ta çalışma | Hedeflenen bağımsız model yok | `index.ts:2415` canlı PTY varsa kapanışı soruyor; `:5478` son pencere kapanınca Windows'ta `teardownAndQuit`; `pty.ts:825` toplu sonlandırma. |
| Git worktree | Uygulanmış | `git.ts:263` oluşturma; `:291` kirli/entegre edilmemiş işi koruma; `:332` GC güvenlik kontrolü. Alt düzey silme `:280` üzerinde `--force`; çağıran kontrolünün atlanması riskli. |
| Ağ entegrasyonları | Uygulanmış | Slack, webhook, yerel sır aracısı, telemetri ve tünel bağımlılıkları var. Salt yerel dosya uygulaması olarak tanımlanamaz. Faz 0'da hiçbiri çalıştırılmadı. |
| Demo/sentetik olaylar | Uygulanmış, ayrı kod yolu | `App.tsx:203`: açık geliştirme demosu veya gerçek PTY bulunmayan ofiste mock döngüsü. `:213` koşulu `DEMO || !hasLive`; açık demo modu gerçek oturumla birlikteyken de sentetik olay üretebilir. |

## Uygulama–belge ayrımları

1. `docs/ARCHITECTURE.md` SQLite için maliyet defterini de sayıyor; `db.ts` şeması bunu içermiyor. Maliyet kaydı başka modüllerde dosya tabanlı; SQLite desteğiyle karıştırılmamalı.
2. `MEMORY_GRAPH_SPEC.md` uygulanmadı diyor; arayüz bileşeni ve onu çağıran kod mevcut. Tasarım dosyası tarihsel bir aşamayı anlatıyor.
3. `SECURITY.md` ağ yüzeyini yalnız Unix soketiyle sınırlı anlatıyor; `telemetry.ts:259`, `integrationBroker.ts:103`, `slack.ts:181`, `webhook.ts:244` gerçek HTTP dinleyicileri içeriyor. Slack/webhook çağrılarında host açıkça sınırlandırılmıyor; aktif olduğunda erişim Windows ağ/güvenlik duvarı ayarlarına da bağlıdır.
4. Görevlerde `dependsOn` alanı ve görsel bağımlılık gösterimi, dayanıklı DAG yürütücüsüyle aynı değildir. Merkezi zorunlu sıralama bulunamadığı için bu yetenek “kısmi” sınıfındadır.
5. README `:503` sonrası daha çok sohbet entegrasyonu, daha kapsamlı avatar olayları ve genişletilmiş kalıcılığı gelecek iş sayıyor. Yerel kodda görülmeyen Pro/mobile/hesap özellikleri bu denetimde uygulanmış kabul edilmedi.

## Öncelikli riskler

| Öncelik | Bulgu | Etki ve AjanKatı karşılığı |
|---|---|---|
| Yüksek | `config.ts:876` / `ensureClaudePermissionsAccepted`, `index.ts:2955` çağrısı global Claude izin/trust ayarlarını yazabiliyor. | Kullanıcının mevcut güvenlik tercihini değiştirir. AjanKatı global ayar yazmayacak; sır veya auth dosyası kopyalamayacak. |
| Yüksek | `agentProvider.ts:176` Claude otomatik modu `bypassPermissions`; Codex `:210` `workspace-write` ve onay kapalı. | Sağlayıcılar aynı izolasyonu sağlamaz. Referans testi `test/auto-mode-sandbox.test.cjs`, Claude sandbox bulunamazsa çalıştırmanın mutlaka durmasını beklemiyor. Windows'ta gerçek koruma bu incelemede doğrulanmadı. |
| Yüksek | `hooks.ts:205`, `:271`, `:308`: hook kaybı/işleme hatasında izin denetimi açık kalabiliyor. | Denetim kanalı kaybı güvenli otonomi değildir. AjanKatı korunan koşuyu durduracak veya insan bekleyen duruma alacak. |
| Yüksek | `index.ts:3328`–`:3348` dosya IPC kökünü renderer'dan alıyor. `fs.ts:100` verilen kök içinde yol kontrolü yapıyor. | Kök içinde kalmak, kökün kullanıcıca yetkilendirildiği anlamına gelmez. Ele geçirilmiş renderer açısından yetki genişlemesi riski; sömürü testi yapılmadı. AjanKatı yalnız proje kimliği alıp kökü işçiden çözecek. |
| Yüksek | Hook çerçevesinde `agent_id` istemciden geliyor (`hooks.ts:383`); bu yolda oturum yetkisi doğrulaması görülmedi. | Aynı kullanıcı bağlamındaki süreçlerden olay taklidi riski; Windows pipe ACL'si ayrıca doğrulanmalı. Aracı servisteki capability kontrolü tüm hook yoluna otomatik uygulanmış sayılmaz. |
| Orta–yüksek | Dosya yönlendirme ardından ayrı arşivleme (`hive.ts:1882`); dosya/Git/localStorage/SQLite birlikte. | Çökme anında tekrar teslim, kayıp güncelleme ve farklı doğruluk kaynakları. AjanKatı tek SQLite sahibi, işlem ve outbox kullanacak; dış yan etkiler için exactly-once iddiası olmayacak. |
| Orta–yüksek | Ana süreçte senkron dosya taraması ve Git commit (`hive.ts:2826`, `:2893`). | Ajan/mesaj sayısıyla ana döngü gecikmesi; hook yanıtı ve arayüz etkilenebilir. Geçmiş büyümesi ve hassas verinin Git geçmişinde kalması ayrıca risk. |
| Orta | xterm başına 100.000 satır (`terminalPool.ts:141`), Pixi en az 2 çözünürlük katsayısı (`OfficeFloor.tsx:257`). | 8 GB cihazda bellek/GPU baskısı. Gizli ticker durdurma ve görünür terminal için WebGL kiralama olumlu önlemler; performans ölçümü yok. |
| Orta | `index.ts:2336` arka plan yavaşlatması kapalı; renderer'da çok sayıda poll döngüsü. | Enerji tüketimi ve görsel katmana bağlı koordinasyon. AjanKatı zamanlamayı işçiye taşıyacak. |
| Orta | `index.ts:104` ve `:107` yakalanmamış hatadan sonra devam ediyor. | Bilinmeyen tutarlılık durumunda hizmeti sürdürme riski. İşçi kritik hatada yeni iş almayı kesmeli. |
| Orta | `index.ts:2376` ve `:2380` medya dışındaki izinlerde genel kabul. | Gereğinden geniş tarayıcı izin yüzeyi; AjanKatı varsayılan reddetme kullanacak. |
| Orta | `analytics.ts:2`, `:153`: ürün analitiği varsayılan açık/çıkışlı. | Yerel çalışma beklentisiyle sürpriz veri çıkışı. AjanKatı MVP'sinde dış telemetri yok. |
| Orta | Çok büyük modüller, sağlayıcıya özgü şablonların `hive.ts` içinde birleşmesi. | Değişiklik etkisini ve test sınırlarını büyütür. Bağımsız adaptör ve politika modülleri gerektirir. |

Olumlu korumalar da var: renderer sandbox/contextIsolation ve kapalı nodeIntegration (`index.ts:2329`), HTTP(S) dış bağlantı filtresi (`:2408`), CSP (`src/renderer/index.html`), yol/symlink kontrolleri, hook gövde sınırı, Slack imzası, webhook sabit zamanlı karşılaştırması ve `safeStorage` ile sır saklama (`integrations.ts:107`). Bunlar genel güvenlik onayı değildir.

## Test ve inceleme sınırları

`test/renderer-sandbox.test.cjs` ve `test/auto-mode-sandbox.test.cjs` içerikleri incelendi. İlki AST üzerinden pencere sandbox ayarını denetliyor; ikincisi sahte Electron bağımlılığı ve geçici dizinlerle ayar/preset sözleşmesini sınırlandırıyor. Windows izolasyonunun gerçek uçtan uca kanıtı değiller. `hooks-framing`, `worker-wake`, `hive-task-mutation`, `fs-path-containment`, `quit-sweep` gibi test dosyaları envanterde mevcut; hepsinin içeriği incelenmedi ve hiçbiri çalıştırılmadı.

Statik inceleme bağımlılık CVE taraması, paket ikili denetimi, tedarik zinciri incelemesi veya performans testi değildir. Pro sürüm ve uzak servis davranışları kapsam dışı. Kurulu Claude/Codex sürümleri ve yetenekleri sorgulanmadı.

## Yerel kanıt parmak izleri

Aşağıdaki SHA-256 değerleri incelenen dosyaları yeniden bulmayı kolaylaştırır; tüm ağacın bütünlüğünü veya çalışma ağacının temizliğini kanıtlamaz.

| Dosya | SHA-256 |
|---|---|
| `LICENSE` | `248A5810204FCADC50FCB9DC3700F464AC52B403280229C32949299375792CD1` |
| `LICENSE-ASSETS` | `4092445C589DC08D62350DBAED64EA53772B967E32FB72E19670B73288054E0B` |
| `package.json` | `F53DBEDD52220316D981FB15B9530729765E4B3F652384EB28D7C26CF7B8DC31` |
| `src/main/index.ts` | `F61B71E0F0FAAA9906BD100D1D74D89EB5C644FDB3A5DF9843E70D84DA31C6B7` |
| `src/main/hive.ts` | `EE2C194E52F1A9B053597F548B2148AC83FB3CE2AEFD3F11D19AEC1C3AD3BFF9` |

## Faz 0 kabul ölçütü

Denetim; istenen alt sistemleri kaynakla eşleştirir, belge iddiasını çalışma kanıtından ayırır ve riskleri yeni tasarım kararlarına bağlar. Runtime sonuçları açıkça doğrulanmamış olarak kalır. Uygulama geliştirmeye geçmeden önce [yol haritasındaki](05-MVP-ROADMAP.md) Windows uyumluluk kapıları tamamlanmalıdır.
