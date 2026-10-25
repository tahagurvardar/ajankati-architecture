# Faz 1A — Çalıştırılan doğrulamalar

Tarih: 25 Ekim 2026. Bu kayıt uygulanan ilk mock dikey akışa aittir. Tarihsel `docs/01–12` değişmedi. Ürün, iki gerçek CLI'li MVP veya güvenli otonomi olarak sunulmaz.

## Bu ortamda gözlenen sonuçlar

Linux x64; Node v24.19.0, pnpm 11.25.0. Electron v45.0.0'ın gömülü Node sürümü v24.22.0, SQLite sürümü 3.53.4 olarak ayrıca sorgulandı.

| Tam komut | Gerçek sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | Başarılı; lockfile ile kurulum |
| `pnpm lint` | Başarılı; ESLint hata yok |
| `pnpm typecheck` | Başarılı; TypeScript hata yok |
| `pnpm build` | Başarılı; worker/main/preload CJS ve React renderer üretildi |
| `pnpm test` | Başarılı; 6 dosyada 28 test |
| `pnpm verify` | Başarılı; lint → typecheck → build → test |
| `pnpm demo` | Başarılı; ayrı derlenmiş worker mock teslimi `awaiting_review` durumuna getirdi, otomatik kabul yok |
| `pnpm format:check` | Başarılı; kaynak biçimi tutarlı |
| `pnpm audit` | Son koşuda bilinen güvenlik açığı bulunmadı |
| `pnpm audit --prod` | Bilinen güvenlik açığı bulunmadı |
| `pnpm exec electron --version` | v45.0.0 |
| `pnpm exec electron --ozone-platform=headless --disable-gpu tests/fixtures/desktop-smoke.cjs` | Başarılı; gerçek production giriş/preload/React/main/Node worker/SQLite hattı, mock sonuç ve kabul komutu |
| `git diff --exit-code 410a859f882180df612736e377df1a97778693ad -- 'docs/0*.md' 'docs/1*.md'` | Başarılı; 12 mimari belgesinde değişiklik yok |

Electron smoke testi `sandbox`, `contextIsolation` ve kapalı `nodeIntegration` tercihlerini; renderer'da `require` bulunmamasını denetler. Testte sandbox kapatma bayrağı kullanılmaz. Linux ekransız ortamda DBus hizmeti bulunmadığına dair stderr uyarıları görüldü; smoke akışı çıkış kodu 0 ile tamamlandı. GPU kapatma yalnız bu ekransız test komutunda; ürün varsayılanı değildir. Normal pencereli Windows kullanımının veya GPU performansının kanıtı değildir.

Electron indirmesi ilk denemede `fetch failed` verdi; ortam proxy'sini kullanan `NODE_USE_ENV_PROXY=1` ile yeniden indirme başarılı oldu. İlk tüm-bağımlılık audit'inde tsx'in geçişli eski esbuild sürümüne ait düşük önem bulgusu vardı; tsx 4.23.15'e güncellendi ve audit tekrarında bulgu kalmadı. CJS smoke fixture eklendiğinde lint'in modül türü kuralı hata verdi; yalnız `.cjs` dosyaları için Node/CJS kuralları tanımlanıp lint tekrar geçirildi. İlk typecheck'te CSS modül bildirimi ve testteki geçersiz metot kullanımı düzeltildi. Sonuç tablosu son başarılı koşuları gösterir, ilk hataları gizlemez.

## Testlerin kanıtladığı sınır

- Sürüm/yöntem/boyut/alan doğrulaması; sahte shell yetkisi ve bilinmeyen alan reddi.
- Geçerli/geçersiz görev durum geçişleri; ajan turundan doğrudan başarı yok.
- SQLite migration 1'in tekrarsız açılması, reopen sonrası proje/görev/olay kalıcılığı; yabancı anahtar ve revizyon çakışmasının atomik reddi.
- Teslim hash'i ile insan kabulü komutu; iptal edilmiş göreve geç sonucun uygulanmaması; eski running görevin interrupted toparlanması.
- Gerçek child IPC ile ayrı derlenmiş Node worker; tek yazıcı kilidi ve normal kapanış sonrası yeniden açılma.
- React form akışı gerçek servis ve SQLite'a bağlı; ayrıca gerçek Electron köprüsüyle uçtan uca smoke.

Bağımsız incelemede kritik bulgu kalmadı. Bulunan stale lock durumu bilinen sınırlama olarak README'deki güvenli manuel kurtarma prosedürüyle açıklandı. Otomatik kilit devralma uygulanmadı.

## Henüz doğrulanmayanlar

Bu yerel ortamda Windows 11, ConPTY/node-pty, gerçek Claude/Codex protokolü, named pipe DACL, Job Object, dosya/ağ sandbox'ı, uyku/güç kesintisi, paketlenmiş installer/imzalama ve 8 GB performans hedefleri test edilmedi. Arka plan/bağımsız yeniden bağlanma, DAG, durable outbox, gerçek araç onayları, model routing, API anahtar kasası ve MCP/skill/plugin etkinleştirme henüz uygulanmadı. SQLite dosyası sır kasası değildir; yeni migration öncesi backup/restore kapısı henüz yoktur.

İlk GitHub Linux koşusunda temel kontroller geçti; Electron adımı SUID sandbox helper'ının root sahibi/4755 modunda olmaması nedeniyle durdu. Workflow, Electron'un desteklenen helper kurulumunu yapacak şekilde düzeltildi; sandbox kapatılmadı ve namespace güvenlik politikası gevşetilmedi.

GitHub workflow Linux ve Windows üzerinde temel kontroller ile Electron smoke testini tanımlar. Gerçek run sonuçları PR'ın Checks bölümünden doğrulanmalıdır; workflow dosyasının bulunması tek başına başarılı test anlamına gelmez. Windows CI geçerse dahi ConPTY/CLI/native güvenlik kapıları geçmiş sayılmaz.

Bir sonraki en küçük kilometre taşı: [Windows ConPTY prosedürünün](WINDOWS-CLI.md) yalnız test executable'ı ile terminal açma, Türkçe giriş, resize, Ctrl+C ve exit dilimi. Gerçek CLI otomasyonundan önce native güvenlik kanıtları ayrıca gereklidir.
