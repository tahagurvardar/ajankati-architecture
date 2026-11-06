# Faz 1C-3F — Codex 0.164.0 araç aracılığı kararı

Tarih: 6 Kasım 2026. Başlangıç: `24a05abe2a245a38f508de897eb1dbd5b3ef393e`.
Dal: `feat/phase-1c-3f-codex-tool-mediation-audit`.

## Karar: NO-GO

**Pinned Codex'i kullanıcı yetkileriyle güvenilir provider olarak çalıştırıp bütün
güvenilmeyen etkileri LPAC broker'a devretmek bu kanıtlarla güvenli kabul edilemez.**
Özel dynamic tool devir yolu mevcut; bütün yerleşik araçlar, MCP, hook, plugin,
başlangıç işlemleri ve alt süreçler için tek, zorunlu, yürütme öncesi kapı olduğu
kanıtlanmadı. Mevcut onay ve bildirim yollarını böyle bir kapı saymak yanlış olur.
Bu, Codex'in hiçbir yapılandırmada güvenli olamayacağı iddiası değildir.

Mevcut [codex-session](../apps/worker/src/codex-session.ts) fixture-only'dir:
id+method içeren her server request'i APPROVAL_REQUIRED ile keser, diğer
ilerlemeleri atabilir. Bu, provider'ın tüm yan etkilerini önleme kanıtı değildir.
[Handshake](../apps/worker/src/codex-handshake.ts) yalnız initialize/startup
allowlist'idir; gerçek araç onayı/delegation içermez. [3A](verification/PHASE-1C-3A.md)
offline onay tüketimi yürütme izni değildir; [3B](verification/PHASE-1C-3B.md)
lease'in ömrü inceleme süresiyle sınırlı; [3C](verification/PHASE-1C-3C.md)
restricted-token negatif kanıtı ve [3D](verification/PHASE-1C-3D.md) tasarım
varsayımları bu yeni raporla doğrulanmış OS garantisine dönüşmez.

`executionAllowed=false`; `liveExecution=failed` ve doğrulanamayan bütün ürün
kapıları `unknown` kalır. `ManagedPreflight.authorizeExecution` koşulsuz reddeder.
Ürün worker/adaptör/contracts/storage/native kodu, SQLite sahipliği, recovery,
insan onayı ve R1/R2/R3/R4 kanıtları değiştirilmedi.
[Mevcut kapılar](../apps/worker/src/managed-preflight.ts).

## Kaynak ve sürüm sınırı

Yerel [pinned protokol kanıtı](protocol/codex-0.164.0/README.md), binary SHA-256
`6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36` ile üretilmiş
beş initialize/startup şemasıdır; araç yürütme şeması veya runtime kabul testi
değildir. R4 initialize-only başarısı yeni görevlere yetki vermez.

Resmî GitHub API'de `rust-v0.164.0` etiketi tag nesnesi
`fe3b29455488c2e189e43ad5526a107900c5e1b7` üzerinden commit
`6aaac694803004a63c6f393d153c96d22521a6b9` adresine çözüldü.
[Etiket](https://api.github.com/repos/openai/codex/git/ref/tags/rust-v0.164.0),
[tag nesnesi](https://api.github.com/repos/openai/codex/git/tags/fe3b29455488c2e189e43ad5526a107900c5e1b7).
İmza doğrulaması API'de `false/unsigned`; kaynak–kurulu executable reproducible
build eşitliği **UNKNOWN**. Kaynak arşivi indirildi, derlenmedi/çalıştırılmadı.
İncelenen dosyaların SHA-256 ve değişmez URL'leri
[kaynak manifestinde](protocol/codex-tool-mediation-0.164.0.sources.json).

Web aracının tag URL önbelleği ile commit arşivi aynı satır/içeriği göstermedi
(ör. `server_request_definitions!` 1741 / 1812). Önbellek görüntüsü karar kanıtı
olarak kullanılmadı. Aşağıdaki bağlantılar indirilen **commit** dosyalarına gider.
0.167.0, `main`, güncel belgeler veya bu oturumun araçları 0.164.0 garantisi
olarak kullanılmadı. Kaynakta görülen davranışlar yerel runtime'da test edilmedi.

## Protokol yönleri ve işlem envanteri

Burada SUPPORTED yalnız belirtilen dar yeteneğin kaynakta bulunmasıdır;
UNSUPPORTED belirtilen mekanizmanın iddia edilen garantiyi sağlamadığına dair
somut karşı kanıttır; UNKNOWN yeterli kanıt bulunmamasıdır.

### Server → client request (id ve method; cevap bekler)

Tam `ServerRequest` enum envanteri [S1] içindedir. Bunlar birbirinin yerine
kullanılamaz; request ID, item/call ID, thread ID ve turn ID farklı kimliklerdir.

| Yöntem | Dar yetenek | Sınıf / kanıt | Güvenlik anlamı |
|---|---|---|---|
| `item/commandExecution/requestApproval` | Komut için onay isteme | SUPPORTED [S1], [S5] | Kabul sonrası komut provider tarafında yürür; dış executor callback'i değildir |
| `item/fileChange/requestApproval` | Dosya değişikliği onayı | SUPPORTED [S1], [S5] | Bütün dosya okumalarının kapısı değildir |
| `item/permissions/requestApproval` | Ek izin isteme | SUPPORTED [S1], [S5] | Scope artırma isteği; dar broker politikası reddetmelidir |
| `item/tool/call` | Dynamic tool istemcide çalıştırma ve sonuç alma | SUPPORTED [S1], [S3], [S4], [S5] | Yalnız kayıtlı özel araç; bütün built-in'leri yeniden yönlendirmez |
| `item/tool/requestUserInput` | Kullanıcı girdisi | SUPPORTED [S1] | İnsan kimliği veya yürütme yetkisi ispatı değil |
| `mcpServer/elicitation/request` | MCP elicitation girdisi | SUPPORTED [S1] | Her MCP çağrısı/başlatılması için zorunlu aracılık değil |
| `account/chatgptAuthTokens/refresh` | Haricî host token yenileme isteği | SUPPORTED [S1] | Seçilen provider-owned auth tasarımı için kullanılmayacak |
| `attestation/generate` | İstemciden upstream attestation sonucu isteme | SUPPORTED [S1] | AjanKati LPAC token/job attestation kanıtı değildir |
| `currentTime/read` | Deneysel dış saat | SUPPORTED [S1] | Tek başına güvenilir monotonic saat/approval değil |
| `applyPatchApproval`, `execCommandApproval` | Eski API onayları | SUPPORTED [S1] | Yeni turn yolu yerine legacy yüzey; modelde reddedilir |

`thread/start.dynamicTools` deneysel alandır [S2]; mevcut initialize isteği
`experimentalApi=false` gönderir. Bu faz capability açmadı. Dynamic çağrının
gerçek alanları: `threadId`, `turnId`, `callId`, `namespace`, `tool`, `arguments`;
sonuç `contentItems`, `success` [S3]. Bu sözleşmeye hayalî broker/grant alanları
eklenmedi. Simülasyonun `review` metodu Codex API'si değildir.

### Bildirimler ve normal ilerleme

`item/started`, `item/completed`, `item/commandExecution/outputDelta`,
`item/fileChange/outputDelta`, `item/mcpToolCall/progress`, `hook/started`,
`hook/completed`, `command/exec/outputDelta`, `process/outputDelta` ve
`fs/changed` server notification enum'undadır [S1] (satır 2000–2044).
Bu türlerin bildirim olarak varlığı SUPPORTED; bildirimlere cevap vermeyerek
işlemi zorunlu olarak bloke etme iddiası **UNSUPPORTED** [S1], [S5].
Dynamic tool için önce item-start bildirimi, ayrıca ayrı `item/tool/call`
request'i gönderilir [S5] (1098–1128). Bildirim gelmesi kabul veya tamamlanma
kanıtı sayılmaz; output delta işlem başladıktan sonra gözlem olabilir.

### Client → server işlemleri

`thread/start`, `thread/resume`, `thread/fork`, `turn/start` görev/oturum
işlemleridir. Ayrıca `command/exec` ve write/terminate/resize, deneysel
`process/spawn` ve process kontrolü, `fs/readFile`, `fs/writeFile`,
`fs/createDirectory`, `fs/remove`, `fs/copy`, metadata/directory/watch,
`mcpServer/tool/call`, plugin install/uninstall/reconcile/share ve
`environment/add` gibi **istemci kaynaklı** yüzeyler vardır: SUPPORTED, [S1].
Bunlar server'dan gelen approval istekleri sanılmamalı; bu faz hiçbirini çağırmadı.
Gelecek adapter bunları renderer/model çıktısından doğrudan iletemez.

## Tam aracılık yetenek matrisi

| İstenen garanti | Sonuç | Exact-version dayanak ve sınır |
|---|---|---|
| Özel aracı dış istemciye devir | SUPPORTED | Dynamic handler sonuç bekler; app-server request'e çevirir [S3], [S4], [S5] |
| Dynamic tools eklemek bütün built-in/MCP araçlarını değiştirir | UNSUPPORTED | Core, MCP, extension araçları eklenir, ardından dynamic araçlar **eklenir** [S7] (147–174) |
| Bütün shell komutları insan onay request'inden geçer | UNSUPPORTED | `Decision::Allow → Skip`; `Never` sandbox'a güvenerek çalıştırabilir, `OnRequest` bazı sınırlı komutlarda sormaz [S8] (445 ve 818–847), [S9] (168–203) |
| Shell araçlarını model kataloğundan kapatma | SUPPORTED | `Feature::ShellTool` kapalı / shell type Disabled iken shell registration dönüyor [S7] (1235–1270). Bu host sürecinin tüm subprocess yollarını kapatmaz |
| Read-only sandbox yalnız onaylı dosyaları okur | UNKNOWN | ReadOnly sözleşmesi var [S10]; AjanKati exact-scope/handle sınırının eşdeğerliği gösterilmedi |
| Dosya onayı bütün read/write/patch etkilerini önceden keser | UNSUPPORTED | FileChange request değişiklik için; shell Skip yolu ayrı, fs client API'leri ayrı [S1], [S8] |
| Bütün ağ etkileri dynamic tool veya approval callback'ine gider | UNKNOWN | Hosted/extension araçları ayrı kaydedilir [S7]; provider egress, auth, MCP ve subprocess trafiğinin uçtan uca deny-by-default ispatı yok |
| MCP çağrı ve başlangıçlarının tamamı `item/tool/call` olur | UNSUPPORTED | MCP handler `prepare_mcp_call` / `handle_mcp_tool_call` yolunda; dynamic handler ayrı [S11] (222–292), [S7] |
| Hook çalıştırma yalnız app-server insan onayından sonra olur | UNSUPPORTED | PermissionRequest hook onay UI'sinden önce çalışabilir [S13]; hook runner doğrudan süreç başlatır [S12] (242–251) |
| Plugin/hook/subprocess etkilerinin tümü broker'a devredilebilir | UNKNOWN | Model catalog filtresi süreç yetkisi değildir; hook, extension ve MCP ayrı yollar [S7], [S11], [S12], [S13]. Bütün startup/config/plugin yollarının kapalı olduğu kanıtlanmadı |
| `external-sandbox` dış executor seçer veya güvenlik sınırı kurar | UNSUPPORTED | Mevcut dış sandbox varsayar ve full disk erişimi verir [S10] (1197–1204); bu faz için çözüm değildir |
| Deneysel uzak execution environment kaydı | SUPPORTED | `environment/add`, `execServerUrl`, opsiyonel bearer token [S1], [S14] |
| Uzak environment = bütün host yan etkilerine zorunlu LPAC broker | UNKNOWN | Ayrı exec-server taşıması; hook/auth/MCP/global host işlemleri için tam kapsama kanıtı yok. Yeni entegrasyon uygulanmadı |
| Tek güvenli ayarla tüm doğrudan provider-side execution kapalı | UNKNOWN | İncelenen request/registration/hook yollarında bütün yüzeyleri kapsayan kanıt yok [S1], [S7], [S12]. `never` ve `external-sandbox` böyle ayarlar değildir |
| Mevcut ChatGPT auth'un Codex tarafından saklanıp yenilenmesi | SUPPORTED | AuthMode::Chatgpt kaynak sözleşmesi [S1] (21–36); özel kullanıcı auth'u incelenmedi |
| Auth secret'larının bütün untrusted araçlardan OS ile ayrılması | UNKNOWN | Aynı kullanıcı süreç yetkisi ayrımı kanıtlanmadı; LPAC bootstrap da NO-GO [3E](verification/PHASE-1C-3E.md) |
| Trusted provider + LPAC broker ile tam aracılık | UNKNOWN | Devir altkümesi var; provider tam etkisizlik ve LPAC sınırları yok. Bu belirsizlik nedeniyle ürün kararı NO-GO |

`approvalPolicy=untrusted` de “her işlem için onay” değildir: açık exec-policy
allow kuralları ayrı değerlendirilir [S8]. `acceptForSession`, exec-policy ve
network-policy amendments kaynakta bulunur [S5] (2022–2058); mevcut tek kullanımlık
AjanKati incelemesi bunlara çevrilemez. Prompt/skill talimatı, katalogdan gizleme
ve modelin iyi davranması güvenlik sınırı olarak kabul edilmez.

## Hata, kopma, tekrar ve geç cevaplar

| Dar özellik | Sonuç | Kanıt / neden |
|---|---|---|
| Malformed/error/dropped shell veya patch approval cevabını ret sayma | SUPPORTED | Callback hata dalları `ReviewDecision::denied`; turn-transition özel hatası erken döner [S5] (1961–2082) |
| Dynamic result bozuk/error/drop olduğunda başarılı tool sonucu üretmeme | SUPPORTED | `fallback_response` success=false [S6] (18–113) |
| Tüketilmiş callback ID'ye tekrar cevap verilince yeniden teslim etmeme | SUPPORTED | Callback map'ten remove; bulunmayan ID yalnız uyarı [S15] (484–597). Bu kalıcı replay koruması değil |
| Aynı call ID ve reconnect/restart için exactly-once | UNKNOWN | Dynamic pending kayıt aynı call ID'de overwrite uyarısı verebilir [S4] (210–221); idempotence veya kalıcı ledger garantisi çıkarılamaz |
| Kanal kaybında bütün süreç/ağ/dosya etkilerinin atomik durması | UNKNOWN | Pending callback hatası dar kanıttır. Disconnect, thread yaşam döngüsü, stdio/WebSocket farkı, OS cleanup ve başlamış etkiler birlikte doğrulanmadı |
| Desteklenmeyen araç/unknown method'ın bütün provider yollarında etkisiz kalması | UNKNOWN | Yerel adapter reddedebilir; Codex'in tüm dispatch/startup yolları için evrensel garanti kanıtlanmadı |
| AjanKati modelinde eksik onay, yanlış digest/scope/kanal, replay ve geç cevap reddi | SUPPORTED (yalnız model) | [Model](../scripts/codex-mediation-model.ts), [testler](../tests/codex-mediation-model.test.ts); runtime garantisi değildir |

Gelecek transport bilinmeyen istekleri fail-closed durdurmalı; ağ kopmasını
başarı saymamalı, grant iptal etmeli ve process owner'dan doğrulanmış cleanup
beklemelidir. Kill, önceden gerçekleşmiş dosya/ağ etkisini geri almaz. Bir
request'i reddetmek, provider'ın önceki/bağımsız işlemlerini sandbox'a sokmaz.

## Auth ayrımı ve önerilen mimari

Hedef tasarımda kullanıcı girişini yalnız resmî provider bileşeni saklar ve
yeniler. AjanKati token okumaz, kopyalamaz, deşifre etmez, proxy olmaz; araçlara
home/config/auth/environment veya token/DB/approval handle'ı aktarmaz.
`chatgptAuthTokens` host-owned yenileme modu bu seçimin yerine kullanılamaz
([S1]'de ayrıca internal/unstable olarak işaretli).

Bu hedefin gerçekleşmesi için auth sahibi bileşen model kaynaklı shell, MCP,
hook ve plugin çalıştıramamalı; yalnız dar, doğrulanmış tool intent'lerini
worker'a göndermeli. Model içeriği provider'ın dosya/ağ yetkilerine erişebiliyorsa
yalnız tool çocuklarını LPAC'a koymak credential gizliliğini sağlamaz. Bunun
kanıtı burada **UNKNOWN**, credential gizliliği test edilmiş değildir.

Alternatifler:

1. **En küçük güvenli sonraki adım:** aynı commit için kaynak seviyesinde
   kapalı yapılandırma manifesti çıkar: startup/config/plugin discovery, MCP
   initialization, hooks, hosted web/search, direct fs/process ve remote environment
   dispatch call graph'ları. Her etki için kapatma koşulunu ve fallback yokluğunu
   kanıtla; credential okumayan stub/fixture testleri tasarla. Gerçek provider
   launch yok. Tüm etkiler kapanmıyorsa upstream'den resmî inference-only +
   mandatory external-tools sözleşmesi iste; istek bu fazda gönderilmedi.
2. Bütün provider runtime'ını ayrı güvenlik ortamına koyma, auth/egress ve host
   veri aktarımını ayrıca tasarlama. Bu yeni araştırmadır; 3E profilesiz LPAC
   NO-GO'sunu veya 8 GB kaynak bütçesini çözmez. VM/Sandbox kurulmadı.
3. Mevcut manuel etkileşimli kullanım ve offline incelemeyi sürdürme; managed
   yürütmeyi kapalı tutma. Sürüm yükseltmesi ayrı exact-version audit gerektirir;
   0.167.0 davranışı otomatik devralınamaz.

GO için birlikte gerekenler: provider'ın bütün untrusted etkilerinin mandatory
devir/ret kanıtı, credential sınırı, 3E native bootstrap ve cleanup çözümü,
handle yaşam boyu scope, gerçek insan kanalı, crash/recovery/ownership sürekliliği
ve exact binary/OS altında ayrı yetkilendirilmiş kabul testleri. Bugün yoklar.

## Çevrimdışı deneyin kapsamı

Yeni model `scripts/` altında, üretimden import edilmez. Tek sentetik
`fixture_read_resource` dynamic çağrısı, opaque resource ID ve en fazla 32 byte
niyeti kabul eder; **dosyayı okumaz**. Context ve review test harness'ının güvenilir
varsayılan girdileridir; dış kullanıcı kimliği doğrulanmaz. Tam istek/context
digest'i, request ID, thread/turn/call, kanal, expiry ve tek tüketim bağlanır.
Kabul `MODEL_ACCEPT` olsa bile `executionAllowed=false`, `liveExecution=false`.
Provider'a gidecek cevap, IPC, process, network veya DB API'si yoktur.

LF veya CRLF çerçeveli canonical JSONL altkümesi kullanılır: JSON.parse sonrası tekrar serialization
aynı değilse ret (whitespace ve duplicate keys dahil); bu tam Codex parser'ı
değildir. Fatal UTF-8, 4 KiB buffered input/callback, 64 frame ve 256 KiB toplam
sınırı vardır. Split/coalesced frame ve truncation sınanır. İkinci request,
malformed frame, bilinmeyen notification/request, scope değişimi ve yanlış
review modeli kalıcı kapatır. Bildirim body'leri opaque olup yalnız gözlenir;
tam notification schema uyumluluğu iddiası yoktur. Saat test girdisidir;
expiry yalnız feed/review çağrısında kontrol edilir, gerçek watchdog değildir.
Restart/persistence, farklı taşımalarda ordering, native job kill, token,
LPAC, Codex ve gerçek insan onayı bu modelle test edilmez.

Test ve komut ayrıntıları: [1C-3F doğrulama kaydı](verification/PHASE-1C-3F.md).

## Değişmez kaynak dizini

[S1]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/common.rs
[S2]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L145-L151
[S3]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/v2/item.rs#L1668-L1683
[S4]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/dynamic.rs
[S5]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/bespoke_event_handling.rs
[S6]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/dynamic_tools.rs
[S7]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/spec_plan.rs
[S8]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/exec_policy.rs
[S9]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/orchestrator.rs
[S10]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/protocol/src/protocol.rs#L1178-L1204
[S11]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/tools/handlers/mcp.rs
[S12]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/engine/command_runner.rs
[S13]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/hooks/src/events/permission_request.rs
[S14]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server-protocol/src/protocol/v2/environment.rs#L38-L58
[S15]: https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/app-server/src/outgoing_message.rs

S1: yön/enumeration/auth; S2–S6: dynamic ve approval akışları; S7–S9:
araç kayıt/politika; S10: sandbox sözleşmesi; S11–S13: ayrı MCP/hook yolları;
S14: uzak environment; S15: callback yaşam döngüsü. Bunların hiçbiri bu fazda
çalıştırılmış upstream test sonucu olarak sunulmaz.
