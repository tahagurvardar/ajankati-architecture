# Faz 1C-1 — Gerçek CLI keşfi ve sürüm kanıtı

Tarih: 28 Ekim 2026 (Asia/Baku). Kapsam: keşif + açık onaylı `--version`; gerçek ajan görevi veya model isteği değil.

## Uygulama

`packages/contracts/src/agents.ts` tipli registry ve Zod `agents/v1` zarfını tanımlar. Yalnız `list`, `discover`, `verify` vardır. Main mevcut pencere/main-frame/dosya URL denetimini uygular, worker tekrar şema doğrular. UI genel kanal, yol, argüman veya environment gönderemez. Bozuk worker zarfı bağlantıyı kapatır. Tek eşzamanlı keşif/doğrulama ve client'ın mevcut 32 istek sınırı korunur.

Worker PATH'in ilk 128 girdisinde yalnız sabit iki CLI adını `.exe`, ardından `.cmd` sırasıyla arar. Cwd ve alt dizinleri, göreli/boş, UNC/device, credential kökleri atlanır; PATHEXT, PowerShell alias veya shell araması kullanılmaz. Bir sağlayıcı için ilk aday gösterilir; tanınmayan wrapper başka kurulumla sessiz değiştirilmez. WinGet linkleri kanonik hedefe çözülür. Native kimlik: kanonik yol + bigint device/inode/size/mtimeNs/ctimeNs. Orijinal PATH adayı ve kanonik kaynak da onay öncesi tekrar denetlenir.

Codex `.cmd` en fazla 4097 byte okunur, 4096 üstü reddedilir; standart npm shim şablonuyla tam eşleşme gerekir. `.cmd` ve JavaScript giriş dosyası çalıştırılmaz. Yalnız sabit npm platform paketlerindeki Windows native `codex.exe` yolları denenir (`bin` ve eski `codex` düzenleri). Claude npm `.cmd`, özel wrapper ve tanınmayan kurulum açıkça desteklenmiyor gösterilir. Native Claude `.exe` desteklenir. Kurulum/updater veya global ayar değişimi yoktur.

Keşif süreç başlatmaz. UI kartındaki düğme dosya kimliğine bağlı tek kullanımlık UUID onayını tüketir. Dosya değişimi/rediscovery eski onayı geçersiz kılar. Worker yalnız `--version`, `shell:false`, kapalı stdin, görünmez Windows penceresi ve SystemRoot/WINDIR/TEMP/TMP allowlist ortamıyla açar. NODE_OPTIONS, API anahtarları ve kalıtsal ajan yetkileri aktarılmaz. HOME/CODEX_HOME yönlendirilmez; auth dosyaları okunmaz/kopyalanmaz. Çalışma dizini executable'ın dizinidir.

Kontrolün zaman aşımı 4 saniye; toplam stdout+stderr 4096 byte. Ham stderr/log/çıktı UI veya SQLite'a kaydedilmez. Yalnız tam provider-specific sürüm satırı ayrıştırılır; tanınmayan çıktı hata olur. Yeni veya prerelease sürüm metni ayrıştırılsa da süreç/izin/iptal/sandbox yetenekleri **unknown** kalır. **verified** yalnız yerel sürüm çıktısını ifade eder. Yönetilen görevler **unsupported**, **enabled=false**. Kanıt kaynağı, OS/arch, zaman, sürüm ve executable fingerprint saklanır.

Envanter worker belleğinde kalır. SQLite/storage kodu, migration 1 ve mevcut kullanıcı DB yolu değiştirilmedi; migration/yedekleme gerektiren veri dönüşümü yoktur. Testler kendi geçici DB/profile dizinlerini kullanır. `.serena` ve gerçek kullanıcı verileri kapsam dışıdır.

## Windows kanıtı

Ortam: Windows x64 `10.0.26300`, Node `24.20.0`, pnpm `11.25.0`, Electron `45.0.0`.

Manuel başlatılan yerel komut doğrulaması:

```powershell
pnpm exec tsx scripts/verify-agents.ts --approve-version-checks
```

Bu komut gerçek derlenmiş worker IPC'sini ve geçici SQLite DB'yi kullanır. Sonuç: Claude Code **2.1.296**, Codex CLI **0.164.0**; ikisi de sürüm doğrulandı, etkin değil. Claude WinGet native executable, Codex npm platform paketindeki native executable üzerinden çalıştı. Auth veya görev komutu çağrılmadı. Bu script CI veya uygulama açılışında otomatik çalışmaz.

Desktop smoke varsayılan olarak yalnız keşif yapar, gerçek provider çalıştırmaz. Yerel gerçek sürüm düğmeleri testi ayrıca açık opt-in gerektirir:

```powershell
$env:AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS = '1'
$env:AJANKATI_SMOKE_SCREENSHOT = "$PWD\apps\desktop\dist\agents-smoke.png"
pnpm test:desktop
```

Yerel sonuçlar:

| Kontrol | Gerçek sonuç |
|---|---|
| `pnpm verify` | Lint, typecheck, build geçti; 12 dosyada **55/55 test** geçti |
| Keşif/sözleşme | Eksik CLI, Windows yol filtreleri, native `.exe`, tam npm `.cmd`, özel wrapper reddi, bilinmeyen sürüm/çıktı, onay tekrarı/kimlik değişimi, eşzamanlı istek reddi geçti |
| Credential sınırı | Fixture credential dizinine junction üzerinden erişim reddi; yalnız bounded shim dosyasının açılması; sır/Node injection ortamının taşınmaması geçti |
| Süreç hataları | Gerçek eksik executable/Node sürüm süreci; kontrollü subprocess fixture ile timeout, kapanış gelmemesi, çıktı taşması, başarısız çıkış ve abort geçti |
| `pnpm test:desktop` | Sandbox açık Electron/preload/main/worker/SQLite, Ajanlar keşfi, geçersiz onay reddi, CSP inline script/style reddi geçti |
| Açık opt-in Windows UI | İki gerçek onay düğmesiyle Claude **2.1.296**, Codex **0.164.0**; ikisi de yalnız sürüm doğrulandı ve etkin değil |
| ConPTY regresyonu | Türkçe klavye → xterm yankısı → Ctrl+C → çıkış, birim testlerde resize/flood/crash temizliği geçti |
| `pnpm demo` | Mock teslim inceleme bekliyor; otomatik başarı/insan kabulü yok |
| Bağımsız kod incelemesi | Kritik bulgu yok; timeout metninin kesin temizlik vaat etmemesi düzeltildi |

İlk yeni credential testinde ESM namespace'e doğrudan spy takılamadı; gerçek `open` işlemini koruyan modül sarmalayıcısıyla düzeltildi. Opt-in smoke'un ilk denemesinde React keşif güncellemesi beklenmedi; sonuç durumunu bekleme eklenerek gerçek UI akışı tekrar geçti. Bunlar son başarılı sonuçların öncesindeki gözlenen test hatalarıdır. Geçersiz UUID olumsuz testi Electron log'unda beklenen IPC reddi üretir.

İlk PR CI turunda Linux geçti; Windows runner'ın `RUNNER~1` kısa TEMP yolu nedeniyle iki test ham yol/kanonik yol karşılaştırmasında kaldı. Uygulama doğru uzun yolu çözüyordu; beklentiler `realpath` ile aynı dosya kimliğine bağlandı. Güvenlik filtresi veya assertion kapsamı gevşetilmedi.

Vite'ın mevcut 500 kB parça uyarısı sürer (renderer yaklaşık 566 kB); kaynak performans hedefi ölçüldü iddiası yoktur. Smoke'un gerçek pencere görüntüsü araçla incelendi; insan tarafından elle klavye/fare kabul testi veya Windows dosya erişim trace'i yapılmış sayılmaz. GitHub Linux/Windows PR kapıları ayrıca izlenir; yerel Windows sonucu Linux kanıtı yerine kullanılmaz.

## Açık sınırlar ve sonraki adım

Bu keşif bir OS sandbox veya publisher imza doğrulayıcısı değildir. PATH ve yerel executable kurulumuna kullanıcı güveni gerekir. Aynı kullanıcı tarafından eşzamanlı dosya değiştirmeye karşı handle-bound launch/TOCTOU garantisi yoktur. İsim/sürüm çıktısı provider kökenini kriptografik kanıtlamaz. Native dosyanın iç davranışı üzerinde OS dosya erişim trace'i yapılmadı; AjanKatı kodunda credential dosyası açılmadığı test ve incelemeyle doğrulanır.

Zaman aşımı doğrudan child.kill ister ve kapanış için 500 ms daha bekler; genel alt süreç sahipliği/Job Object garantisi yoktur. Worker normal kapanırken aktif sürüm kontrolüne abort gönderir; zorla worker ölümünde CLI ağacı temizliği kanıtlanmış değildir. Gerçek oturumlar bu yüzden kapalıdır. Süreç ağacı, izin ve cancellation bilinmeden “güvenle yönetiliyor” denmez.

Faz 1C-2'nin en küçük kapsamı: önce Windows Job Object/sahiplik ve worker ölümü temizliğini kanıtla; sonra aynı kimliğe bağlı, açık proje/oturum onaylı **tek** Claude Code veya Codex etkileşimli ConPTY oturumu aç. Türkçe giriş, resize, Ctrl+C, süreli durdurma, normal çıkış ve crash temizliği iki sağlayıcıda ayrı doğrulansın. Otomatik istem/görev devri, arka plan, MCP veya ücretli istek testi bu ilk oturum dilimine eklenmesin. İzin/sandbox bilinmiyorsa etkileşimli mod açık sınırlarla etiketlensin; yönetilen otonomi açılmasın.

Resmi komut dayanakları: [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference), [OpenAI'nin Codex sürüm kontrolü örneği](https://help.openai.com/en/articles/20001607-using-daybreak-in-codex-cli). Yerel Codex launcher kaynağında platform paketi/native yol düzeni salt okunur incelendi; global dosya değiştirilmedi.
