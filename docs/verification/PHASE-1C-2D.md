# Faz 1C-2D — initialize-only PARTIAL_FRAME incelemesi

29 Ekim 2026; Windows x64, Node 24.20.0. Gerçek provider çalıştırılmadı.

## Olay ve kesinlik sınırı

İnsan tarafından bildirilen önceki tek seferlik olay: initialized=false,
cleaned=true, pid=18624, durationMs=1493, tokens/cost=UNKNOWN,
error=PARTIAL_FRAME, komut exit code=1. Bu çalışma eski planı veya SQLite
ledger'ını açıp çalıştırmadı, sıfırlamadı, silmedi, taşımadı veya değiştirmedi.
Komutun 1 çıkışı provider'ın 1 ile çıktığının kanıtı değildir; eski taşıyıcı
provider çıkış kodunu toplamıyordu.

Doğrulanmış yerel kök nedenler:

- Ayrıştırıcı bir native okumayı tek JSONL mesajı sanıyordu. Birleşik geçerli
  startup bildirimi + initialize yanıtı reddediliyordu. JSONL satır sınırları
  artık chunk sınırlarından bağımsız; bölünmüş çok byte'lı UTF-8 de işlenir.
- İlk hata korunmuyordu. Hatalı tamamlanmış satır buffer'da kalınca cleanup
  callback'i önceki hatayı PARTIAL_FRAME ile değiştirebiliyordu. Artık ilk
  protokol hatası korunur; UTF-8, JSON, yanıt, beklenmeyen istek, initialize
  reddi ve gerçek yarım son satır ayrı kategorilerdir.
- stop hemen pipe handle'larını kapatıyor, kalan stdout/stderr'i atıyordu.
  Ayrıca boş okuma ile sonraki process-exit sorgusu arasında yarış vardı.
  Boş okuma artık EOF sayılmaz: native ERROR_BROKEN_PIPE durumu ayrı izlenir.
  Stop, job=0 doğrulamasından sonra pipe'ları ACK kontrollü boşaltır; closed
  mesajı normal yolda iki EOF ve son stdout ACK'inden sonra gönderilir.
- Stop anında önceden gerçekleşmiş doğal çıkış STOPPED ile maskelenebiliyordu.
  Yeni deterministik kırmızı/yeşil test bu sınıflandırmayı PROCESS_EXIT yapar.
- Eski native fixture initialized bildirimini stdout'a geri echo ediyordu;
  erken kapatma bunu saklıyordu. Fixture artık bildirime yanıt üretmez.

Bunlar gerçek olayın hangi ilk mesajdan kaynaklandığını kanıtlamaz. Ham çıktı
saklanmadığı için gerçek ilk hata, başlangıç bildirimi, provider'ın doğal çıkış
kodu ve olası çevre/config etkisi belirsizdir. Gerçek handshake'in şimdi
çalıştığı iddia edilmez. Otomatik retry eklenmedi.

## Protokol ve güvenli tanılama

[Resmî protokol](https://learn.chatgpt.com/docs/app-server) JSONL kullanır.
[Hash'i sabit 0.164.0'dan üretilen şemalar](../protocol/codex-0.164.0/README.md)
repo'da yer alır. Yalnız offline generate-json-schema çalıştırıldı; app-server
sunucusu, thread, turn, model, login veya ücretli istek çalıştırılmadı.
InitializeResponse içindeki codexHome/platform metadata'sı önceki Zod
validator tarafından zaten atılıyordu; bunlar tek başına hata açıklaması değil.

Allowlist yalnız initialize yanıtı ve id içermeyen warning, configWarning,
deprecationNotice bildirimlerini kapsar. Thread hedefli uyarılar, bilinmeyen
mesajlar, ikinci yanıt ve tüm approval/tool/server istekleri reddedilir.
İlk başarılı yanıttan sonra cleanup sırasında gelen istekler de başarıyı bozar.
Uyarı metinleri, stdout/stderr ve codexHome gibi yollar diske yazılmaz.

Probe JSON raporu ilk failure kategorisini, ayrı transportError'ı,
providerExitCode (yoksa null), stdoutBytes, stderrBytes ve outputDrained'i
raporlar. Provider çıkışı yalnız job sonlandırılmadan önce signaled process
handle'ından alınır; zorla sonlandırma kodu doğal provider çıkışı diye yazılmaz.
[GetExitCodeProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess)
sözleşmesi temel alınır. STDERR_LIMIT gibi durumlarda sayı gözlenen byte
sayısıdır; outputDrained=false ise toplam çıktı miktarı diye yorumlanmamalıdır.
Raw hata mesajı yerine güvenli kategori yazılır; dosya sistemi istisnalarındaki
özel yollar konsola taşınmaz. Mevcut ledger şeması değişmedi: reason genel
PROTOCOL_ERROR kalabilir; ayrıntı güvenli operator JSON raporundadır.

16 KiB okuma, tek outstanding ACK, 64 KiB/64 yazma kuyruğu, 5 s handshake,
15 s owner, 18 s dış watchdog ve 4 s cleanup sınırları korunur. Toplam stdout
256 KiB/64 frame ile sınırlı; stderr 256 KiB aşımında durdurulur. Kapanış
boşaltmasına 1,5 s ek iç sınır uygulanır; başarısız boşaltma açık kategoriyle
raporlanır, tam boşaltma iddia edilmez. Job ownership, hash gate, process
creation/handle allowlist ve fail-closed güvenlik kontrolleri değiştirilmedi.
Global Codex/Claude ayarları, .serena, design-reference ve canlı inference
kapısı değiştirilmedi.

## Doğrulama

- Düzeltmeden önce birleşik frame, hata kategorileri, son yarım frame ve stop
  sırasında kalan stdout/stderr testleri kırmızı görüldü. İlk byte-parçalama
  testinin each veri biçimi hatası düzeltildi; bu timeout ürün hatası sayılmadı.
- İlk tam verify: lint/typecheck/MSVC build başarılı, 22 dosyada 145/145 test.
- Son odaklı koşu: 29/29 handshake/owner testi geçti; timeout, frame sayısı,
  bilinmeyen mesaj, cleanup sırasındaki tool isteği, UTF-8 parçalama ve gerçek
  0.164.0 metadata biçimi dahil.
- Windows regresyonları: erken exit=23, yarım son frame, stdout kapanması,
  birleşik JSONL, 48.001 byte stdout + 48.001 byte stderr'in eksiksiz boşaltılması,
  doğal çıkış kodu ve doğrulanmış cleanup. Mevcut containment/crash testleri korundu.
- Desktop ilk koşu 1440×900 integrations odak kontrolünde başarısız oldu.
  Kod/deadline değiştirilmeden tek başına ikinci koşu exit 0: tüm layout/focus,
  CSP, sessions/v1 kapalı, ConPTY ve SQLite/mock/insan kabul kontrolleri geçti.
  Bu, ilk odak hatasının kök nedeninin çözüldüğü iddiası değildir.
- pnpm audit --prod: bilinen güvenlik açığı yok.

## Daha sonra yeni tek seferlik test

Bu çalışma yeni probe planı hazırlamadı. Ayrı insan onayından sonra yeni ve
boş bir checkout/build dizini kullanılmalı; eski olayın dist/profile/plan/lock/
ledger dosyaları kopyalanmamalı, taşınmamalı veya değiştirilmemeli. Onaylanacak
commit ve native binary hash'i doğrulanmalı; mevcut policy/ancestor güvenlik
kontrolleri geçmeli. Yeni dizinde --prepare yalnız yeni plan ve ayrı ledger
konumu için kullanılmalı. Oluşan somut initialize-only plan ayrıca insan
incelemesi/onayı aldıktan sonra o dizindeki --approve-initialize-only bir kez
çalıştırılabilir. Eski dizinde komut çalıştırılmamalı. Retry=0; inference kapalı;
credential aktarımı yok; sadece initialize/initialized. Başarısızlık halinde
plan tüketilmiş kalır; cleanup belirsizse karantina korunur. Sonraki her deneme
yeni bağımsız insan onayı gerektirir. Güvenli JSON kategorileri, exit code,
byte sayıları ve job cleanup sonucu karşılaştırılır; transcript toplanmaz.

Son tam doğrulama: pnpm verify çıkış 0; lint, typecheck ve MSVC build geçti; 22 dosyada **157/157 test**, 56,84 saniye. Vite'ın mevcut >500 kB uyarısı sürüyor. Gerçek Codex handshake sonucu hâlâ doğrulanmadı.
