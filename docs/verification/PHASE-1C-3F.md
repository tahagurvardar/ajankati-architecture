# Faz 1C-3F — Codex tool mediation doğrulaması

Tarih: 6 Kasım 2026, UTC+04:00. Dal:
`feat/phase-1c-3f-codex-tool-mediation-audit`.
Base: `24a05abe2a245a38f508de897eb1dbd5b3ef393e`.

## Sonuç

[Türkçe karar ve kaynaklı yetenek matrisi](../14-CODEX-TOOL-MEDIATION-DECISION.md):
**NO-GO**. 0.164.0 dynamic tool devir altkümesi mevcut; tüm yan etkilerin önceden
kesilebilmesi, provider auth sınırı ve LPAC runtime güvenliği kanıtlanmadı.
`executionAllowed=false`, `liveExecution=failed`; ürün UNKNOWN kapıları değişmedi.

Yeni teslim: salt bellek kullanan JSONL/policy modeli, bir sentetik fixture,
46 odaklı test, kaynak hash manifesti, karar ve bu doğrulama kaydı. Üretim kodu,
lockfile, bağımlılıklar, SQLite/onay/recovery ve R1–R4 değişmedi. Önceden bulunan
`.serena/` teslim dışında. Kaynak kodundan çıkarım runtime kanıtı olarak sunulmaz.

## Gerçek komut sonuçları

Ortam: Windows x64; Node `24.20.0`, pnpm `11.25.0`, Python `3.13.15`,
MSVC `18.11.12306.390` (verify build çıktısı). Yeni testler platform bağımsız;
Ubuntu bu yerel oturumda çalıştırılmadı.

| Komut | Gözlenen sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; already up to date; 144 ms pnpm süresi |
| `pnpm verify` | exit 0; lint/typecheck/native build/renderer build geçti; **30 dosya, 402 geçti / 1 skip**, 58.37 s; test başlangıcı 23:15:12 |
| `pnpm verify` (CRLF düzeltmesi sonrası son koşu) | exit 0; lint/typecheck/build geçti; **30 dosya, 403 geçti / 1 skip**, yeni model **46/46**, 58.44 s; başlangıç 23:25:34 |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock, UI/CSP, ConPTY, nested-tree cleanup geçti; provider version process çalışmadı |
| `pnpm audit --prod` | exit 0; No known vulnerabilities found |
| İlk `pnpm exec vitest run tests/codex-mediation-model.test.ts` | exit 1; implementasyon henüz yok, import bulunamadı; 1 suite failed, 0 test çalıştı; 23:11:51 |
| Aynı odaklı komut, model eklendikten sonra | exit 0; ilk **40/40** test geçti; 527 ms; 23:12:35 |
| Sonraki beş sınır testi | Full `verify` içindeki **45/45** yeni test geçti; ayrı odaklı tekrar yapılmadı |
| `pnpm exec vitest run tests/native-path-boundary.test.ts --reporter=verbose --silent=false` | exit 0; **18 geçti / 1 skip**, 365 ms; 23:17:53; skip nedenini görünür kılmak için tek tekrar |
| `pnpm exec prettier --write scripts/codex-mediation-model.ts tests/codex-mediation-model.test.ts` | İlk deneme pnpm store kilidi erişim reddi; izinli normal kullanıcı tekrarı exit 0 |
| `pnpm exec prettier --check scripts/codex-mediation-model.ts tests/codex-mediation-model.test.ts` | İlk deneme aynı store lock erişim reddi; izinli tekrar exit 0, tüm dosyalar uygun |

## Hatalar, uyarılar ve atlamalar

1. İlk test çağrısında pnpm eksik workspace dependencies'ini otomatik kurdu:
   224 reused, 0 downloaded. Sonraki zorunlu frozen install ayrıca çalıştırıldı.
   İlk import hatası beklenen test-önce aşamasıdır; davranış assertion başarısızlığı
   olarak sayılmaz. İkinci çağrı 40 testi, full suite son 45 testi çalıştırdı.
2. Prettier'in ilk çağrısı `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, kullanıcı
   pnpm lock dosyasında access denied ile başlamadı. Sandbox dışı izinli tekrar
   normal kullanıcı bağlamındadır; administrator elevation yapılmadı.
3. Full suite ve görünür native tekrardaki tek skip: `rejects a symlink without
   following its target`, `Windows account cannot create file symlinks (EPERM)`.
   Yetki değiştirilmedi; skip izolasyon başarısı değildir. Yeni 45 testte skip yok.
4. Vite mevcut >500 kB chunk uyarısını verdi. Desktop `Downloading Electron
   binary...` yazdı. Kapalı sessions-start ve bozuk approval UUID hata logları
   smoke'un beklenen negatif kontrolleridir; provider görevi değildir.
5. Kaynak keşfinde GitHub tree web açılışı cache miss verdi. Raw tag web
   önbelleği commit arşiviyle eşleşmedi, kanıttan çıkarıldı. Shell'in ilk public
   GitHub API isteği sandbox ağ hatası verdi; ardından tag ve commit arşivi
   salt-okunur normal kullanıcı izniyle indirildi. Credential kullanılmadı.
6. Arşiv açarken Windows tar, `vendor/bubblewrap/LICENSE` linki için
   `Invalid argument` ve delayed error bildirdi. Komutun son directory-list
   işlemi exit 0 verdiğinden bunu tam extraction başarısı saymıyoruz. İncelenen
   regular dosyalar okunabildi; hash'leri manifestte. Vendor link araştırma
   konusu değildi; kaynak derlenmedi veya çalıştırılmadı.
7. Keşifte mevcut olmayan `core/src/tools/handlers/read_file.rs` ve
   `app-server/src/fs_api.rs` aramaları dosya-yok hatası verdi. Gerçek fs
   işlemcisi `request_processors/fs_processor.rs` olarak bulundu. Hata,
   yeteneğin yokluğuna kanıt sayılmadı; karar yalnız okunan kaynaklara dayanır.
8. İlk `gh pr list` sandbox socket erişim reddi verdi; izinli salt-okunur
   tekrarda exit 0, mevcut PR yok. Bu ürün/test hatası değildir.
9. İlk staged diff kontrolünde karar belgesi sonunda ek boş satır bulundu ve
   düzeltildi. Git'in LF→CRLF uyarısı fixture checkout riskini gösterdi. Ek CRLF
   testi 23:24:20'de **1 failed / 45 passed** verdi (624 ms): canonical kontrol
   CRLF terminatörünü JSON gövdesi sayıyordu. Parser yalnız LF önündeki tek CR'yi
   framing olarak ayıracak şekilde düzeltildi; canonical gövde kontrolü korundu.
   İki TypeScript dosyası tekrar biçimlendirildi (exit 0); bu değişiklik nedeniyle
   `pnpm verify` yeniden çalıştırıldı. Önceki başarılı koşu gizlenmedi veya son
   sürümün sonucu olarak yeniden etiketlenmedi.

Bağımsız reviewer model, test ve source-backed karar iddialarını salt-okunur
inceledi; önemli bulgu bildirmedi. Kaynak/tool kayıt, approval skip, hook sırası,
dynamic hata ve callback tüketim iddiaları örneklenerek kontrol edildi. Bu ayrı
runtime testi veya eksiksiz upstream güvenlik denetimi değildir.
CRLF düzeltmesi için ek salt-okunur inceleme de somut sorun bildirmedi.
Son çalışma ağacı `git diff --check` exit 0; staged kapsam ayrıca teslim öncesi
kontrol edilir. Ürün kaynaklarında yeni model import'u bulunmadı.

Zorunlu install/verify/desktop/audit komutları için başarısız tam koşu olmadı;
CRLF düzeltmesi sonrası verify tekrarlandı. Native skip'in açıklaması için ek tek dosya koşusu yapıldı. Eski
Windows diagnostic/restricted-token/ConPTY fixture'ları full doğrulamada çalışır;
bunlar yeni LPAC execution veya provider görevi değildir. 3E preflight yalnız
kendi token/attribute sorgularını yapar; LPAC child başlatmaz.

## Nelerin test edilmediği

Gerçek Codex app-server, CLI version probe, provider turn, model task, auth,
MCP/plugin entegrasyonu, LPAC launch, AppContainer profili, ACL/firewall/policy,
admin veya paid altyapı işlemi yapılmadı. Yeni model untrusted shell çalıştırmaz;
dosya okuması bile yapmaz. GitHub kaynak araştırması, dependency audit ve GitHub
teslimi geliştirme trafiğidir; “offline” simülasyondaki provider/tool I/O yokluğunu
ifade eder, tüm geliştirme oturumunun internetten kopuk olduğunu değil.

Kalan blokörler: mandatory tam tool gate, bütün doğrudan host etkilerini kapatma,
secret/credential OS ayrımı, kanal kopması/late reply/restart uçtan uca davranışı,
exact source–binary eşlemesi ve 3E profilsiz LPAC/bootstrap/cleanup. Bir sonraki
adım yalnız aynı commit'in effect/call-graph ve kapalı config manifesti araştırması;
hiçbir olumlu model sonucu canlı yürütmeye çevrilemez.
