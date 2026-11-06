# Faz 1C-3G — Etki kapanışı doğrulama kaydı

Tarih: 7 Kasım 2026, UTC+04:00. Dal:
`feat/phase-1c-3g-codex-effect-closure-audit`.
Base: `edd368b59a89c4b2022e76ad7a59aed24fa62d32` (HEAD başlangıçta eşleşti).

## Sonuç ve kapsam

[Türkçe karar ve etki matrisi](../15-CODEX-EFFECT-CLOSURE-DECISION.md): **NO-GO**.
Dar tool registration deny ve bazı feature kapatmaları kaynakta destekleniyor;
provider'ın bütün başlangıç/config/auth/plugin/extension/client API etkilerinin
zorunlu dış kapıdan geçtiği veya kapandığı kanıtlanmadı. Source inspection runtime
izolasyon kanıtı sayılmadı. Mevcut `executionAllowed=false`, `liveExecution=failed`
ve koşulsuz authorizeExecution reddi değiştirilmedi.

Teslim yalnız bu rapor, karar/matris ve yeni kaynak manifestidir. Yeni sentetik
security modeli/testi eklenmedi: config bayraklarını taklit eden bir test upstream
dispatch veya Windows izolasyonunu kanıtlamaz. Bu faz ürün davranışı değiştirmediği
için mevcut regresyonlar ve gerçek kaynak byte/hash kontrolleri kullanıldı.

## Gerçek komut sonuçları

Ortam Windows x64; Node 24.20.0, pnpm 11.25.0, Python 3.13.15;
native build MSVC 18.11.12306.390. Ubuntu bu oturumda çalıştırılmadı.

| Komut/kontrol | Gerçek sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; lockfile unchanged; 224 reused, 0 downloaded; 7.6 s |
| `pnpm verify` | exit 0; lint, typecheck, native + renderer build başarılı; **30 test dosyası, 403 passed / 1 skipped**, 60.52 s; test başlangıcı 00:31:23 |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock, UI/CSP, ConPTY ve nested-tree cleanup PASS; `sessions/v1 blocked; no inference`; otomatik provider version process yok |
| `pnpm audit --prod` | exit 0; `No known vulnerabilities found` |
| `pnpm exec vitest run tests/native-path-boundary.test.ts --reporter=verbose --silent=false` | exit 0; **18 passed / 1 skipped**, 375 ms; 00:33:48; yalnız skip nedenini görünür kılmak için tekrar |
| Kaynak provenance kontrolü | Arşiv SHA-256 eski manifestle aynı; önceki **15/15** dosya hash'i eşleşti; yeni manifestte **42/42** regular dosya arşiv üyeleriyle byte-identical; bütün kayıtlı satır aralıkları dosya sınırları içinde |

Zorunlu dört komut tek kez çalıştı; başarısız tam koşu veya düzeltme sonrası
tam koşu tekrarı yok. Sonradan eklenenler Markdown/JSON belgeleridir; üretim,
test veya build girdisi değişmedi. Tek odaklı tekrar skip açıklaması içindir.

## Hata, atlama ve sınırlamalar

- Full suite ve verbose tekrardaki tek skip: `rejects a symlink without following
  its target`; `Windows account cannot create file symlinks (EPERM)`.
  Yetki değiştirilmedi; skip başarılı izolasyon diye sayılmadı.
- Vite mevcut >500 kB chunk uyarısını verdi. Desktop `Downloading Electron
  binary...` yazdı. Kapalı sessions-start ve malformed approval UUID hata
  logları beklenen negatif smoke kontrolleridir; provider yürütmesi değildir.
- Resmî tag/tag-object API'sinin web açılışları erişim hatası verdi. Saklanmış
  3F API yanıtı ve hash'i eşleşen commit arşivi kullanıldı; yeni remote tag
  doğrulaması veya imza doğrulaması yapılmış sayılmadı.
- Kaynak keşfinde eski yerleşime göre tahmin edilen bazı yollar yoktu
  (`core/src/codex.rs`, `config/src/config_loader/mod.rs`, `hooks/src/engine.rs`,
  `ext/src/lib.rs`, `config/src/mcp.rs`, `core/src/tools/policy.rs`,
  `core/src/default_client.rs`). Gerçek yollar rg ile bulundu veya erişilebilirlik
  UNKNOWN bırakıldı. PowerShell'de çift tırnaklı rg pattern iki kez regex hatası
  verdi; quote içermeyen pattern ile tekrarlandı. Bunlar yetenek yokluğu kanıtı
  sayılmadı; upstream program çalıştırılmadı.
- İlk manifest üretim kontrolü eski JSON'daki UTF-8 BOM nedeniyle
  `JSONDecodeError: Unexpected UTF-8 BOM` verdi (exit 1). Eski dosya
  değiştirilmeden `utf-8-sig` ile okundu; tekrar exit 0, 42/42 karşılaştırma
  başarılı. İlk başarısız denemede yeni manifest/karar index'i yazılmamıştı.
- Arşiv önceki fazdan kalmadır; bu fazda tekrar extraction yapılmadı. Önceki
  vendor LICENSE link problemi saklanır. Yeni kontrol yalnız regular üyeleri
  tarfile üzerinden okudu; arşiv kodu derlenmedi/çalıştırılmadı.
- Kaynak index'inin üretilmiş satır etiketlerinde PowerShell pipe encoding'i
  tireyi `?` yaptı; yalnız bu 42 index kaydındaki etiketler ASCII tireyle
  düzeltildi. Kaynak byte'ları/hash'leri etkilenmedi. 42 source ID/index kaydı
  ve yerel belge bağlantıları son kontrolde geçti.
- İlk `git add` sandbox'ın `.git/index.lock` yazım kısıtıyla reddedildi.
  Kullanıcının onayladığı normal kullanıcı sandbox-dışı tekrar exit 0 verdi;
  administrator/OS elevation veya güvenlik policy bypass yapılmadı.

Gerçek Codex app-server, provider turn, credential okuma/kopyalama, global CLI/
config/plugin değişimi, AppContainer/LPAC launch, ACL/firewall/policy değişimi,
OS yetki yükseltmesi veya güvenlik policy bypass izni, ücretli altyapı/yeni provider işlemi yapılmadı.
Full suite'in mevcut diagnostic/restricted-token/native fixtures'ı yeni LPAC
kanıtı değildir; 3E preflight process'i LPAC child başlatmaz. R1/R2/R3/R4
kanıtları yeniden üretilmedi veya değiştirilmedi. SQLite/onay garantileri aynı.

## Kalan güvenlik blokörleri ve çıkış ölçütü

Karardaki B1–B5: toplam effect gate, değişmez config/lifecycle, OS/credential
ayrımı, ownership/cleanup/insan kanalı ve exact source–binary/runtime kanıtı.
Her UNKNOWN bağımsız blokördür. Yeni bir upstream sözleşmesi veya ayrıca
yetkilendirilmiş tam runtime izolasyon tasarımı olmadan bu sürüm araştırmasını
tekrarlamak önerilmez. MVP için insan kontrollü terminal + offline inceleme
önerilir; terminal sandbox olarak sunulmaz, managed execution açılmaz.

Başlangıçta mevcut `.serena/` untracked dizini teslim dışıdır. Commit/push ve
main hedefli PR kullanıcı tarafından bu faz için yetkilendirildi; merge yasaktır.
