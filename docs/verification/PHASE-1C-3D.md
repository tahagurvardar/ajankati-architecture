# Faz 1C-3D — Windows izolasyon fizibilitesi doğrulaması

Tarih: 6 Kasım 2026, yerel saat UTC+04:00. Dal:
`feat/phase-1c-3d-isolation-feasibility`. Base:
`27f0876f8942e667329bbadd2c3728637375da0b` (PR #16).
Ortam: Windows x64 `10.0.26300`, Node `24.20.0`, pnpm `11.25.0`,
MSVC 2026 `18.11.12306.390`.

## Sonuç ve teslim kapsamı

[Türkçe mimari karar](../13-WINDOWS-ISOLATION-DECISION.md): worker broker +
ağsız LPAC araç yürütücüsü önerildi; provider tool delegation, auth, native
bootstrap/cleanup ve bütün LPAC OS sınırları **UNKNOWN**. Managed yürütme NO-GO.
Bu teslim çalışan AppContainer sandbox uygulaması değildir.

Yeni `scripts/isolation-broker-model.ts` ve 26 odaklı test yalnız çevrimdışı,
in-memory yetki tasarımını değerlendirir. MODEL_ACCEPT bile executionAllowed=false
döndürür. Gerçek IPC, handle I/O, token attestation veya crash persistence yoktur.
Üretim worker/native/contracts/storage/renderer/CI kodu ve lockfile değişmedi.
3A approval/identity/SQLite/recovery, 3B lease ve 3C negatif kontrolleri tam suite
içinde yeniden çalıştı; önceki R1/R2/R3/R4 kanıtları değiştirilmedi.

AppContainer/LPAC başlatılmadı: profilsiz başlangıç ve çökme sonrası temizlik
kanıtı bulunmuyor. Kalıcı profil, ACL/firewall/loopback muafiyeti veya sistem
özelliği oluşturulmadı/değiştirilmedi. VM, credential read/copy, Codex app-server,
provider/model task, otomatik approval ve liveExecution açılması yoktur.

## Gerçek yerel sonuçlar

| Komut | Sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; already up to date, lockfile değişmedi |
| `pnpm exec vitest run tests/isolation-broker-model.test.ts` (model sonrası) | exit 0; 26/26 geçti, 462 ms |
| `pnpm verify` | exit 0; lint/typecheck/build başarılı; 28 dosya, **347 geçti / 1 skip**, 59.00 s |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; Electron/preload/worker/SQLite/mock, UI/CSP, ConPTY, nested-tree cleanup geçti; provider version probe kapalı |
| `pnpm audit --prod` | exit 0; bilinen güvenlik açığı bulunmadı |
| `pnpm exec vitest run tests/native-path-boundary.test.ts tests/windows-sandbox.test.ts --reporter=verbose --silent=false` | exit 0; **34 geçti / 1 skip**, 2.31 s |
| `git diff --check` | exit 0 |
| `pnpm exec prettier --check scripts/isolation-broker-model.ts tests/isolation-broker-model.test.ts` | izinli tekrarda exit 0; iki dosya biçimi uygun |

Yeni 26 saf test Windows API kullanmaz ve Ubuntu'da da çalışabilir. Mevcut
Windows native testleri Ubuntu'da açık platform skip'i yapar; Linux üzerinde
Windows izolasyonu simüle edilmez. Yerel Windows sonucu Ubuntu CI sonucu değildir.
GitHub'ın `ubuntu-latest` / `windows-latest` matrisi değiştirilmedi; PR head
sonuçları ayrıca değerlendirilir.

## Negatif Windows kanıtı

21:58:30 başlayan verbose tekrar, full-suite skip gerekçesini ve gerçek native
gözlemleri görünür kılmak içindir; başarısızlığı gizleyen tekrar değildir.
Gözlem zamanı `1793987911194..1793987912661` ms; fixture SHA-256:
`55be60f26720bb2025ae2e2ff5cf367405be2d851dad45784e7c5c2917153fc4`.
Bu hash yeniden derlenen test executable'ına aittir, attestation değildir.

| Gerçek fixture işlemi | Sonuç |
|---|---|
| Approved/outside/traversal/junction/child read | ALLOWED, Win32 0 |
| Write/delete/rename/replace, lease yok veya kapandı | ALLOWED, Win32 0 |
| Aynı dört değişiklik, lease açık | DENIED, Win32 32; içerik/identity kontrolü geçti |
| Doğrudan job breakaway | DENIED, Win32 5 |
| Kontrollü IPv4 loopback TCP listener | ALLOWED, Win32 0; bir bağlantı görüldü |

Native harness tokenRestricted/jobMember/cleaned değerlerini doğruladı.
Sonuçlar restricted-token adayının yetersizliğini tekrar gösterir; LPAC veya
provider yetkisine dönüştürülmez. Gerçek named pipe/ALPC/COM ve IPv6/UDP/DNS
izolasyonu ölçülmedi; UNKNOWN. Modeldeki open-pipe/sahte kanal retleri bunların
yerine geçmez.

## Hatalar, skip'ler ve tekrarlar

1. İlk yeni test koşusu (21:53:52) model dosyası henüz yokken import hatasıyla
   exit 1 verdi: 1 failed suite, sıfır test çalıştı. Bu assertion RED veya izolasyon
   kanıtı değildir. Model eklendikten sonra 26 test geçti; full-suite de geçti.
   İlk pnpm komutu 224 paketi yerel store'dan hazırladı, downloaded 0 raporladı.
2. Full-suite'deki tek skip, verbose tekrarda doğrulandı:
   `rejects a symlink without following its target`, Windows file symlink için
   `EPERM`. Junction ve unsupported tag testleri geçti. Yetki değiştirilmedi.
3. Build mevcut renderer >500 kB chunk uyarısını verdi. Native build ve diğer
   kontroller başarılı; uyarı giderildi iddiası yoktur.
4. Desktop smoke `Downloading Electron binary...` yazdı. Bu istenen doğrulamanın
   dependency hazırlığıdır; tamamen ağsız kurulum iddiası yoktur. Kapalı
   sessions-start ve sahte approval UUID hata logları beklenen negatif testlerdir.
5. Kaynak keşfinde olmayan `native` kökü için rg ve olmayan `ci.yml` dosyası için
   Get-Content hata verdi; doğru yollar `apps/worker/native` ve
   `.github/workflows/verify.yml` üzerinden incelendi. Ürün/test hatası değiller.
6. Son ek Prettier kontrolü ilk denemede
   `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` / erişim engellendi ile exit 1 verdi.
   Sandbox dışı izinli tekrar exit 0; kaynak değişikliği gerekmedi.
7. İlk `git add` sandbox'ın `.git/index.lock` yazma reddiyle durdu;
   izinli tekrar yalnız beş teslim dosyasını stage etti. CRLF dönüşüm uyarıları
   alındı; staged whitespace kontrolü geçti.

Install/verify/desktop/audit için başarısız tam koşu veya tekrar gerekmedi.
Dokümantasyon araştırması uzaktan araçla yapıldı; fixture'lar dış host'a trafik
üretmedi. Git push/PR, kullanıcının açıkça istediği teslim işlemleridir.
Önceden bulunan izlenmeyen `.serena/` dizini teslim kapsamına alınmadı.
