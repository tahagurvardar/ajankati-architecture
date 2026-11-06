# Faz 1C-3G — Codex etki kapanışı kararı

7 Kasım 2026. Base `edd368b59a89c4b2022e76ad7a59aed24fa62d32`;
dal `feat/phase-1c-3g-codex-effect-closure-audit`.

## Karar: NO-GO; MVP için insan kontrollü terminal

Codex **0.164.0**, commit `6aaac694803004a63c6f393d153c96d22521a6b9`
için bütün provider etkilerini kapatan veya AjanKati'ye zorunlu devreden bir
kapalı yapılandırma kanıtlanmadı. Bazı yolların kapatılması kaynakta SUPPORTED;
bunların birleşimi tam süreç izolasyonu değildir. `executionAllowed=false`,
`liveExecution=failed` (disabled) ve koşulsuz `authorizeExecution` reddi korunur.
UNKNOWN yürütmeye yetki vermez. Üretim kodu veya eski kanıtlar değiştirilmedi.

Bu, küçük ve karar odaklı kaynak incelemesidir; bütün upstream kodun güvenlik
denetimi veya Windows runtime izolasyon testi değildir. Bir yolun açık olduğuna
dair karşı örnek NO-GO için yeterlidir; kalan her aile aşağıda bağımsız UNKNOWN
olarak tutulur. “Hiçbir konfigürasyon güvenli olamaz” sonucu çıkarılmıyor.

## Provenance

3F'nin yerel commit arşivi tekrar hash'lendi: SHA-256
`a0a2e1f349139b712fd72f85193ca40b57611415093ead730de5f07308380d52`.
Önceki manifestin **15/15** dosyası eşleşti. Bu fazın kaynakları ayrıca arşivin
regular üyeleriyle byte düzeyinde karşılaştırılır; hash ve satır aralıkları
[yeni manifestte](protocol/codex-effect-closure-0.164.0.sources.json).
Eski manifest değiştirilmez. Arşiv link extraction sorunu yeni bir tam extraction
başarısı diye sunulmaz; yalnız regular üyeler okunur, kaynak çalıştırılmaz.

Saklanmış resmî tag API yanıtı `rust-v0.164.0` → tag object
`fe3b29455488c2e189e43ad5526a107900c5e1b7` → yukarıdaki commit zincirini içerir;
signature `verified=false`, `unsigned`. Bu oturumdaki web API açılışları erişim
hatası verdi; tag'in bugün yeniden uzaktan doğrulandığı iddia edilmez. Önceki
provenance ve eşleşen arşiv kullanıldı. Yeni içerik/hash uyuşmazlığı yoktur.
3F'deki web önbelleği/tag içerik uyuşmazlığı dışlanmış kanıt olarak kalır.
Kaynak ile kurulu executable'ın reproducible-build eşitliği **UNKNOWN**;
binary veya credential dosyası okunmadı. Yeni sürüm/main kullanılmadı.

## Sınıflandırma ve okuma biçimi

**SUPPORTED** yalnız hücredeki dar kapatma/devir sözleşmesidir.
**UNSUPPORTED** belirtilen evrensel iddiaya somut karşı örnektir.
**UNKNOWN** yolun uçtan uca kapanışı kanıtlanmadı demektir. Kaynakta bulunan
bir flag, yerel etkin config veya çalışma zamanı garantisi değildir. Varsayılanlar
upstream kaynak varsayılanlarıdır; kullanıcı config'i incelenmedi.

E numaraları aşağıdaki değişmez kaynak dizinine ve hash manifestine gider.
“Ön ret” yalnız etki başlamadan o dar yolun reddedilmesini ifade eder.

## Türkçe etki kapanış matrisi

| Yol / giriş → dispatch → etki | Anahtar ve kaynak varsayılanı | Ön ret, bypass/fallback ve bağımsız sonuç |
|---|---|---|
| App-server başlangıcı → ConfigBuilder → katman loader; yerel config/requirements/proje dosyası okuma [E1,E2,E3] | Embedded/system/user/project/session katmanları; `ignore_user_config`, `ignore_project_config` loader seçenekleri. `strict_config` app-server seçeneği | Katman okuma model tool gate'inden önce. Non-strict hatada default config'e dönüş [E1:575–595]; güvenli config hatasını açık varsayılanlara çevirebilir. Sadece boş user config ile bütün katmanları kapatma **UNSUPPORTED**; tam startup kapanışı **UNKNOWN**. |
| App-server → MessageProcessor → PluginsManager startup → Git/HTTP/disk senkronizasyonu [E4,E5,E6] | `plugins` varsayılan true [E7]; runtime `PluginStartupTasks::Start` default [E1]. Test amaçlı skip seçeneği [E8] | `plugins_enabled=false` startup gövdesini ve `plugins_for_config` sonucunu dar olarak kapatır: **SUPPORTED** [E5:823–825,2829]. Git başarısız → HTTP → snapshot yoksa backup archive [E6:103–161]. Git'i kapatmak ağ kapanışı değildir: **UNSUPPORTED**. Reload/list yolları nedeniyle yalnız startup skip ile bütün plugin ömrü **UNKNOWN**. |
| Thread/session → build_hooks_config → Hooks → SessionStart/PermissionRequest/Pre/Post hook → command veya MCP [E9,E10,E11,E12] | `hooks=true`; plugin kaynakları ayrı yüklenir | `hooks=false` ordinary handler'ları çıkarır; builtin cleanup handler'larını tutabilir [E11:267–289], executor hooks sonradan atanabilir [E11:304+]. Dolayısıyla tek flag ile bütün hooks kapanır **UNSUPPORTED**. Boş plugin/executor kaynaklarıyla birlikte tam yaşam döngüsü **UNKNOWN**. Command runner Windows Job spawn kullanır [E12]; Job sahipliği dosya/ağ sandbox'ı değildir. |
| Turn sonu legacy notify → registry.after_agent → command.spawn [E13,E14] | `notify: Option<Vec<String>>`; absent/boş argv'de kayıt yok | `hooks=false` kontrolünden ayrı kuruluyor [E13:135–146]. `notify` absent/boş: bu kayıt için ön kapatma **SUPPORTED**. Hooks flag'inin bunu da kapattığı iddiası **UNSUPPORTED**. Config refresh boyunca yokluğu ayrıca sabitlenmeli. |
| Session environment hazırlığı → ShellSnapshot → shell script/process [E9,E15] | `shell_snapshot=true`, v2=false; ShellTool'dan ayrı koşul | `shell_snapshot=false` ile disabled nesne: **SUPPORTED** [E9:1472–1492]. ShellTool kapalı olsa da v1 snapshot koşulu bağımsız. Login-shell süreç/env/disk etkileri approval callback'i değildir; Windows'taki her shell çeşidinin fiilî davranışı **UNKNOWN**. |
| Model exec_command/write_stdin → registry → orchestrator → runtime [E16,E17,E18] | `shell_tool=true`, `unified_exec=true`; ShellTool=false/Disabled model shell kayıtlarını çıkarır | Dar model-shell kapatma **SUPPORTED** [E16:1235–1265]. UnifiedExec=false one-shot fallback; exec-policy Allow → Skip; approval her komut için zorunlu değil [E17,E18]. “Her shell dış gate'e gider” **UNSUPPORTED**. Spawn edilen çocukların tüm disk/ağ etkilerinin broker kapanışı **UNKNOWN**. |
| Model apply_patch; shell içinden patch interception → verify → safety check → patch runtime [E19,E20] | Model `apply_patch_tool_type.is_some()` ile shell flag'inden bağımsız kayıt [E16:1409–1411] | AutoApprove → Skip [E20:37–43]; parse/verify doğruluğu yetkilendirme değildir. ShellTool=false patch'i kapatır **UNSUPPORTED**. İç ToolPolicy ile ad filtreleme dar **SUPPORTED**, dağıtılmış app-server'da zorunlu dış gate ve tüm patch fallback kapanışı **UNKNOWN**. |
| Model view_image → ExecutorFileSystem metadata/read [E21] | `view_image` feature; kayıt [E16:1423+] | Handler sandbox context geçirir [E21:154–172]: **SUPPORTED**. Bu yalnız incelenen read yolu; AjanKati'nin tek handle/tek dosya scope eşdeğerliği **UNKNOWN**. İç tool policy filtresi başlangıç/skill/config okumalarını kapatmaz. |
| MCP session projection → enabled server startup → RmcpClient → stdio launcher veya HTTP [E22,E23,E24] | Etkin server listesi config/plugin/apps/client katkılarıyla oluşur; `server.enabled()` filtresi [E22:386]; apps/plugins true | Disabled server'ın startup listesinden çıkarılması **SUPPORTED**. Tool deny listesi server startup'ını engellemez. Bütün kaynaklarda boş server listesi, apps/plugins ve refresh boyunca sabitlik henüz kanıtlanmadı: **UNKNOWN**. Elicitation server launch için gate değildir. |
| Model MCP tool/resources → MCP handler/runtime → call/read/list [E25,E16] | MCP tool policy/approval ayrı; resource araçları server varlığında veya CodeModeOnly'de kaydolabilir [E16:1269–1282] | `item/tool/call` dynamic handler'ı bu dispatch değildir: evrensel devir **UNSUPPORTED**. Startup'ın kapanması ile çağrı/resource kapanışı ayrı yükümlülükler; toplam **UNKNOWN**. |
| Model hosted web search → model request ToolSpec; extension web.run → external adapter [E26,E16] | Varsayılan `Cached` [E3:3928–3929]; Live/Indexed ağ, Cached dış canlı web erişimini false işaretler | `web_search=disabled` hosted spec'i ve standalone web.run kaydını çıkarır: dar **SUPPORTED** [E26:15–19,E16:1631–1638]. Cached internetten kopuk runtime değildir. Provider inference/auth/telemetry ağı kapanışı **UNKNOWN**. |
| Image generation, notes/history/goals, skills/memories/git attribution, queue ve diğer extension katkıları → thread_extensions → contributor/adapter [E27,E28,E16] | Factory E27:75–141 aileleri kurar; bazıları feature/state/provider bağımlı. Tool görünürlüğü bütün lifecycle'ın varlığı değildir | Adapter doğrudan executor.handle çağırır [E28:61–81]. Her ailenin dosya/ağ/startup/refresh etkilerini aynı switch ile kapatma kanıtı yok: ayrı ailelerin tamamı **UNKNOWN**. Web/image özel filtreleri genel extension deny değildir. |
| Browser/computer-use yüzeyleri ve dış plugin/MCP katkıları [E7,E27,E16] | Feature tablolarında in_app_browser/computer_use true; bu app-server factory'sinde doğrudan kurulum gösterilmedi | Flag varlığı bu executable'da erişilebilir runtime kanıtı sayılmadı. MCP/extension/remote katkı üzerinden uçtan uca erişilebilirlik ve kapatma **UNKNOWN**; hayalî browser launch zinciri kurulmadı. |
| Code mode → generated exec/wait → nested tool registry veya host process [E16,E29,E7] | code_mode=false, code_mode_only=false; code_mode_host=true, prewarm=false; legacy js_repl removed/false | `register_code_mode_executors` mod uygun değilse döner [E16:1019–1021]: dar **SUPPORTED**. Remote session host `Command::new`/spawn [E29:158–169]. JS_REPL=false tek başına yeni code mode'u kapatmaz; prewarm/nested bütün etkiler **UNKNOWN**. |
| Subagent → spawn/delegate → yeni session/tools [E16,E30] | multi_agent=true; model/depth/role koşulları | Model spawn aracını kaldırma alt oturumların tüm extension/startup yaşamını otomatik ispatlamaz. Agent control spawn yolu ve session kurulumu ayrı; tüm descendant capability/cleanup kapanışı **UNKNOWN**. OS process ile mantıksal subagent aynı şey değildir. |
| Client fs/readFile/writeFile/createDirectory/remove/copy/watch → FsRequestProcessor → executor fs [E31,E32] | Client API, model ShellTool flag'i değil | Read/write çağrıları `sandbox=None` [E31:71,90]. Client allowlist ile hiç gönderilmeyebilir; bu provider içinde evrensel ret değildir. “FileChange onayı bütün fs API'lerini önler” **UNSUPPORTED**. AjanKati'den bu API'ler çağrılmadı. |
| Client command/exec → command processor/manager; process/spawn → PTY/pipe spawn [E33,E34,E32] | command/exec ayrı; process/spawn deneysel protokol yüzeyi | process spawn PTY/pipe çağrıları [E34:309–329] model tool callback'i değildir. `experimentalApi=false` bütün command/fs yüzeylerini kapatmaz. Client kaynaklı yol için allowlist mümkün, provider tüm süreç kapanışı **UNKNOWN**; tek model onayı iddiası **UNSUPPORTED**. |
| Client environment/add → EnvironmentManager.upsert → uzak executor; environment/info bağlantısı [E35] | execServerUrl, opsiyonel bearer; yalnız kayıt verilen uzak ortam | Add kayıt aşamasıdır; info force_info ile ayrı bağlantı [E35:18–65]. Uzak executor seçmek host hooks/auth/config etkilerini taşımaz. “Remote environment bütün provider'ı sandbox'a alır” **UNSUPPORTED**; uzak OS/auth/egress sınırı **UNKNOWN**. |
| Provider auth resolve/refresh → external bearer command; opsiyonel AWS recovery command [E36,E37] | Seçilmiş provider auth command / AWS refresh config; sıradan ChatGPT akışında bunların çalıştığı iddia edilmez | Command.output/status doğrudan alt süreç [E36:103–114,E37:47–66]. Config allowlist ile bu modları dışlama mümkün; model-tool deny bunları kapsamaz. Bütün auth backend/refresh kapanışı ve secret OS ayrımı **UNKNOWN**. Hiçbir gerçek credential okunmadı. |
| Inference, auth prewarm/refresh, analytics/state persistence/remote-control startup [E38,E9,E1] | Provider çalışması ağ gerektirir; analytics=false dar disable [E9:1672+]; remote-control default ResolvePersisted [E1:499] | Tool kapatmak provider ağını/diskini kapatmaz. Model endpoint HTTP fallback [E38:739+] ve startup DB [E1:674+] bağımsızdır. Tek güvenli egress/secret/DB sınırı **UNKNOWN**. “Tüm etkiler kapalı” ile kullanışlı inference aynı iddia değildir. |
| İç host ToolPolicy → registry trusted/external/hosted selection [E39,E40,E16] | default allowed_tools=None; empty list hiçbir tool'a izin vermez; thread init'te yakalanır, resume'da yeniden verilir | Registration öncesi deny **SUPPORTED** [E40:428,445,469], hosted retain [E16:377]. Sadece prompt/katalog gizleme diye küçümsenmez. Fakat public ThreadStartParams'ta bu iç policy için karşılık gösterilmedi [E41]; startup/notify/client API'leri için genel gate değildir. Tam mandatory external gate **UNSUPPORTED**. |
| Dynamic tool → pending callback → item/tool/call → cevap [E42] | Yalnız kayıtlı dynamic tool; core/MCP/extension üzerine eklenir [E16:149–173] | Dar dış devir **SUPPORTED**, toplam replacement **UNSUPPORTED**. Hata/notification/late reply/disconnect ayrıntıları 3F'de; bunlar başlamış süreç veya ağ etkisini geri almaz. Tüm yollar için kopmada atomik durma **UNKNOWN**. |

## Kapalı config adayı neden teslim edilebilir bir güvenlik profili değil?

Kaynakta dar olarak desteklenen önlemler: strict config hatasında durma; user/project
katmanlarını dışlama; shell_tool ve shell_snapshot kapatma; plugins kapatma;
ordinary hooks kapatma **ve ayrıca** notify boşluğu, builtin/executor hook kaynaklarının
yokluğu; tüm MCP kaynaklarının disabled/boş olması; web_search disabled; code mode,
prewarm ve subagent yollarını dışlama; command-backed auth'u dışlama; client fs/process/
environment/plugin mutasyon API'lerini göndermeme. İç ToolPolicy boş allowlist'i
veya yalnız izinli dynamic tool adları kayıtlı araçlara ek bir tavan sağlayabilir.

Bu liste **çalıştırılacak TOML/CLI reçetesi değildir**: iç API ile public config
karıştırılmaz; her seçeneğin runtime'da uygulanabildiği, managed/cloud override,
resume/reload, executor katkısı ve default fallback karşısında korunacağı
kanıtlanmadı. Patch, extension lifecycle, config okumaları, auth ve provider ağı
kalan bağımsız yükümlülüklerdir. Default shell/hooks/plugins/apps açık olduğundan
“config okunamazsa defaults” fail-closed tasarımına uygun kabul edilmez.

Gerçek zorunlu kapı; bütün untrusted etkilerden önce uygulanmalı, default deny
olmalı, bağımsız alternatif dispatch olmamalı ve yetkisiz niyetin doğrudan host
I/O'ya dönüşemediği kanıtlanmalıdır. Approval UI yalnız bazı dallarda bekler;
hook kendisi program çalıştırır; notification/çıktı ise gözlem olabilir. Bunların
hiçbiri tek başına bu sözleşme değildir. İç ToolPolicy olumlu ama kapsamı dar
kanıttır; source inspection kernel isolation kanıtı değildir.

## Blokörler ve uygulanabilir MVP kararı

1. **B1 — toplam etki kapısı:** startup/config, notify, plugin fallback, direct client
   APIs ve auth süreçleri model tool deny dışında. Public pinned app-server için
   doğrulanmış inference-only + mandatory external tool sözleşmesi yok.
2. **B2 — değişmez config/lifecycle:** katmanlar, hata fallback'i, refresh/resume,
   plugin/executor hook katkıları için kapalı bütünleşik manifest yok.
3. **B3 — OS ve secret sınırı:** provider'ın kendi credential erişimi ile untrusted
   kodun etkileri ayrıştırılmadı. 3E LPAC bootstrap/cleanup NO-GO aynen geçerli;
   `external-sandbox` zaten var olan sınırı varsayar, yaratmaz.
4. **B4 — yaşam boyu yetki:** child tree, disconnect/restart, handle kapsamı,
   gerçek insan kanalı ve SQLite ownership/recovery şartları çözülmüş değil.
5. **B5 — provenance/runtime:** kaynak-binary eşitliği ve exact Windows kabul
   testleri yok. Bu rapor eski R1/R2/R3/R4 kanıtlarını genişletmez.

| Seçenek | Karar ve sonraki adım |
|---|---|
| Mandatory external tool gate sağlayan provider | Managed ürün için tercih edilen uzun vadeli sözleşme. Yeni provider satın alma/kurma yok. Ancak resmi sürümlü API, bütün startup etkileri envanteri, default-deny ve credential ayrımı kanıtı gelirse yeni inceleme açılır. Mevcut Codex ile GO değil. |
| Provider runtime'ının tamamını sandbox'a alma | Teknik alternatif; yalnız araç çocuğunu sandbox'a almak yeterli değil. Auth sahibi, egress ve dosya aktarımı sınırı, cleanup ve 8 GB bütçesi ayrı kabul ister. Bugünkü MVP kritik yoluna alınmaz; VM/LPAC kurulmaz. |
| İnsan kontrollü etkileşimli terminal | **Şimdi önerilen MVP.** Mevcut terminal + proje/görev/oturum takibi + kullanıcı tarafından getirilen sonuçların inceleme/kabul akışı. Model çıktısından otomatik paste/Enter, görevden provider turn veya arka plan “devam” yok. Kullanıcı terminal komutunu kendisi başlatır; terminalin sandbox veya managed güvenlik garantisi olduğu iddia edilmez. |

Bir sonraki ürün işi araştırma değil, mevcut manual/offline akışın kullanılabilirlik
teslimidir: (1) görev oluştur/terminal oturumuna git/insanın sonucu eklemesi ve
inceleyip kabul etmesi için tek demo senaryosu; (2) kapalı managed kontrollerinde
açık Türkçe neden ve manuel akışa yönlendirme; (3) restart sonrası görev/oturum
durumunun doğru görünmesi ve otomatik komut çalışmaması kabul ölçütleri.
Bu faz bunları uygulamaz; üretim görev yürütmesi değişmez.

Araştırmayı burada durdur: aynı sürümün yeni bir genel tool-gate deneyi yok.
Yalnız B1/B2'yi değiştiren somut upstream sözleşmesi veya ayrıca yetkilendirilmiş
tam runtime izolasyon tasarımı gelirse yeniden aç. Yeni kaynak/binary/OS kabulü
ve B3–B5 kapanmadan managed execution açılmaz. Böylece kullanılabilir MVP,
kanıtlanmamış güvenli otomasyon vaadine bağlanmaz.

Testler, atlamalar ve teslim kapsamı: [3G doğrulama raporu](verification/PHASE-1C-3G.md).

## Değişmez kaynak dizini

- **E1** `codex-rs/app-server/src/lib.rs`: [477-500](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/lib.rs#L477-L500), [570-595](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/lib.rs#L570-L595), [674-680](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/lib.rs#L674-L680), [1032-1036](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/lib.rs#L1032-L1036).
- **E2** `codex-rs/config/src/loader/mod.rs`: [146-210](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/config/src/loader/mod.rs#L146-L210), [270-290](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/config/src/loader/mod.rs#L270-L290), [510-540](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/config/src/loader/mod.rs#L510-L540), [1150-1180](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/config/src/loader/mod.rs#L1150-L1180).
- **E3** `codex-rs/core/src/config/mod.rs`: [1544-1599](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/config/mod.rs#L1544-L1599), [3172-3216](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/config/mod.rs#L3172-L3216), [3928-3929](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/config/mod.rs#L3928-L3929).
- **E4** `codex-rs/app-server/src/message_processor.rs`: [559-579](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/message_processor.rs#L559-L579), [1242-1243](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/message_processor.rs#L1242-L1243), [1904-1906](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/message_processor.rs#L1904-L1906).
- **E5** `codex-rs/core-plugins/src/manager.rs`: [799-825](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core-plugins/src/manager.rs#L799-L825), [2823-2925](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core-plugins/src/manager.rs#L2823-L2925).
- **E6** `codex-rs/core-plugins/src/startup_sync.rs`: [96-164](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core-plugins/src/startup_sync.rs#L96-L164).
- **E7** `codex-rs/features/src/lib.rs`: [1079-1138](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1079-L1138), [1197-1292](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1197-L1292), [1383-1388](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1383-L1388), [1507-1518](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1507-L1518), [1573-1578](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1573-L1578), [1675-1770](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/features/src/lib.rs#L1675-L1770).
- **E8** `codex-rs/app-server/src/main.rs`: [60-72](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/main.rs#L60-L72), [110-128](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/main.rs#L110-L128).
- **E9** `codex-rs/core/src/session/session.rs`: [1041-1055](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/session/session.rs#L1041-L1055), [1208-1250](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/session/session.rs#L1208-L1250), [1467-1492](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/session/session.rs#L1467-L1492), [1644-1685](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/session/session.rs#L1644-L1685).
- **E10** `codex-rs/core/src/session/mod.rs`: [5558-5589](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/session/mod.rs#L5558-L5589).
- **E11** `codex-rs/hooks/src/engine/mod.rs`: [257-297](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/engine/mod.rs#L257-L297), [304-370](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/engine/mod.rs#L304-L370).
- **E12** `codex-rs/hooks/src/engine/command_runner.rs`: [230-270](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/engine/command_runner.rs#L230-L270), [360-375](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/engine/command_runner.rs#L360-L375).
- **E13** `codex-rs/hooks/src/registry.rs`: [129-160](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/registry.rs#L129-L160).
- **E14** `codex-rs/hooks/src/legacy_notify.rs`: [45-80](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/legacy_notify.rs#L45-L80).
- **E15** `codex-rs/core/src/shell_snapshot.rs`: [1030-1113](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/shell_snapshot.rs#L1030-L1113).
- **E16** `codex-rs/core/src/tools/spec_plan.rs`: [148-178](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L148-L178), [350-381](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L350-L381), [1013-1022](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L1013-L1022), [1235-1283](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L1235-L1283), [1409-1426](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L1409-L1426), [1440-1599](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L1440-L1599), [1624-1651](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs#L1624-L1651).
- **E17** `codex-rs/core/src/tools/orchestrator.rs`: [168-203](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/orchestrator.rs#L168-L203).
- **E18** `codex-rs/core/src/exec_policy.rs`: [440-460](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/exec_policy.rs#L440-L460), [818-847](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/exec_policy.rs#L818-L847).
- **E19** `codex-rs/core/src/tools/handlers/apply_patch.rs`: [319-379](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/apply_patch.rs#L319-L379), [435-465](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/apply_patch.rs#L435-L465).
- **E20** `codex-rs/core/src/apply_patch.rs`: [25-58](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/apply_patch.rs#L25-L58).
- **E21** `codex-rs/core/src/tools/handlers/view_image.rs`: [154-176](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/view_image.rs#L154-L176).
- **E22** `codex-rs/codex-mcp/src/connection_manager.rs`: [327-332](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/connection_manager.rs#L327-L332), [380-420](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/connection_manager.rs#L380-L420), [780-810](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/connection_manager.rs#L780-L810), [940-952](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/connection_manager.rs#L940-L952).
- **E23** `codex-rs/codex-mcp/src/rmcp_client.rs`: [1327-1438](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/rmcp_client.rs#L1327-L1438).
- **E24** `codex-rs/rmcp-client/src/rmcp_client.rs`: [486-535](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/rmcp-client/src/rmcp_client.rs#L486-L535).
- **E25** `codex-rs/core/src/tools/handlers/mcp.rs`: [222-292](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/mcp.rs#L222-L292).
- **E26** `codex-rs/core/src/tools/hosted_spec.rs`: [8-35](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/hosted_spec.rs#L8-L35).
- **E27** `codex-rs/app-server/src/extensions.rs`: [51-141](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/extensions.rs#L51-L141).
- **E28** `codex-rs/core/src/tools/handlers/extension_tools.rs`: [61-81](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/extension_tools.rs#L61-L81).
- **E29** `codex-rs/code-mode/src/remote_session/connection.rs`: [145-175](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/code-mode/src/remote_session/connection.rs#L145-L175).
- **E30** `codex-rs/core/src/agent/control/spawn.rs`: [660-695](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/agent/control/spawn.rs#L660-L695), [890-925](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/agent/control/spawn.rs#L890-L925).
- **E31** `codex-rs/app-server/src/request_processors/fs_processor.rs`: [55-110](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/fs_processor.rs#L55-L110), [150-195](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/fs_processor.rs#L150-L195).
- **E32** `codex-rs/app-server-protocol/src/protocol/common.rs`: [1812-2044](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/common.rs#L1812-L2044).
- **E33** `codex-rs/app-server/src/request_processors/command_exec_processor.rs`: [35-44](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/command_exec_processor.rs#L35-L44).
- **E34** `codex-rs/app-server/src/request_processors/process_exec_processor.rs`: [69-145](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/process_exec_processor.rs#L69-L145), [309-343](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/process_exec_processor.rs#L309-L343).
- **E35** `codex-rs/app-server/src/request_processors/environment_processor.rs`: [18-65](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/request_processors/environment_processor.rs#L18-L65).
- **E36** `codex-rs/login/src/auth/external_bearer.rs`: [103-150](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/login/src/auth/external_bearer.rs#L103-L150).
- **E37** `codex-rs/model-provider/src/amazon_bedrock/auth_refresh.rs`: [27-87](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/model-provider/src/amazon_bedrock/auth_refresh.rs#L27-L87).
- **E38** `codex-rs/core/src/client.rs`: [739-759](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L739-L759), [1190-1215](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L1190-L1215), [1322-1345](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/client.rs#L1322-L1345).
- **E39** `codex-rs/ext/extension-api/src/tool_policy.rs`: [1-43](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/ext/extension-api/src/tool_policy.rs#L1-L43).
- **E40** `codex-rs/core/src/tools/registry.rs`: [421-480](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/registry.rs#L421-L480).
- **E41** `codex-rs/app-server-protocol/src/protocol/v2/thread.rs`: [1-200](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1-L200).
- **E42** `codex-rs/core/src/tools/handlers/dynamic.rs`: [180-240](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/dynamic.rs#L180-L240).
