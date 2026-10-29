# İkinci initialize-only olayı: UNEXPECTED_MESSAGE

## Kanıt ve kapsam

İnsan tarafından bildirilen Codex 0.164.0 sonucu: initialized=false,
cleaned=true, error=UNEXPECTED_MESSAGE, providerExitCode=null, stdoutBytes=448,
stderrBytes=311, outputDrained=true, durationMs=1051, komut exitCode=1.
Bu sayılar mesaj türünü veya gövdesini kanıtlamaz; null doğal provider çıkış
kodunun bilinmediğini gösterir. Gerçek olayın kök nedeni henüz belirlenmedi.

Doğrulanmış kusur: birbirinden farklı protokol retleri aynı hata koduna
indirgeniyordu; sonraki denemeyi ayırt edecek güvenli ayrıntı yoktu.
PR #10'un framing/drain düzeltmesi korunur. Bu değişiklik kabul politikasını
genişletmez ve gerçek handshake başarısı iddia etmez.

## UNEXPECTED_MESSAGE üreten tüm yollar

`apps/worker/src/codex-handshake.ts`, initializeOnly veri callback'i:

1. JSON nesnesinde method var, id yok, notification.safeParse başarısız:
   bilinmeyen yöntem, geçersiz method türü, bilinen yöntemde eksik/geçersiz
   alan, ek alan, metin boyutu sınırı veya thread hedefli warning.
2. Method bulunmayan herhangi bir JSON değeri, geçerli yanıt alındıktan sonra:
   aynı id'li ikinci yanıt, başka id'li yanıt veya yanıt olmayan değer.

Bu dallar hem normal okumada hem drain/terminate sırasında çalışabilir.
Method + id her zaman UNEXPECTED_REQUEST; ilk hatalı yanıt INVALID_RESPONSE;
id=1 ve error taşıyan ilk yanıt INITIALIZE_REJECTED üretir. UTF-8, JSON,
boyut/adet sınırları ve PARTIAL_FRAME ayrı kalır. İlk hata korunur.

## Offline protokol incelemesi

Yeni Codex komutu veya şema üretimi çalıştırılmadı. Depodaki hash'i sabit
0.164.0 executable'dan daha önce üretilmiş [şemalar](../protocol/codex-0.164.0/README.md)
ve mevcut initialize-only uygulaması incelendi:

| Bilgi bildirimi | Şemada zorunlu alan | Opsiyonel alanlar | Initialize-only sınırı |
| --- | --- | --- | --- |
| warning | message: string | threadId: string/null | threadId yalnız yok/null |
| configWarning | summary: string | details, path, range | range start/end, integer line/column >= 0 |
| deprecationNotice | summary: string | details: string/null | yalnız bilgi, id yok |

Üçü de mevcut allowlist'teydi. Bilgi alanları yalnız geçici doğrulanır;
işlem, araç çağrısı veya approval yanıtı üretmez. Metin üst sınırı ve strict
nesneler, upstream şemadan daha dar olan mevcut yerel güvenlik politikasıdır.
Şema geçerliliği tek başına gerçek olayda bildirim gönderildiğini veya
hangi sırada gönderildiğini kanıtlamaz. Yerel kanıt seti tüm server bildirimleri
ve üretim noktalarının tam kaynak dökümünü içermiyor; olası startup mesajlarının
eksiksiz listesi olduğu iddia edilmez. Yeni bildirim kabul edilmedi.

InitializeResponse şeması userAgent/codexHome/platformFamily/platformOs ister;
mevcut minimal validator yalnız userAgent'i denetler, diğer metadata'yı atar.
Bu önceki uyumluluk tercihi değişmedi; metadata varlığı tek başına
UNEXPECTED_MESSAGE açıklaması değildir.

Hipotezler: bilinmeyen bir bilgi bildirimi, bilinen bildirimde strict/policy
uyuşmazlığı veya ikinci yanıt. 448/311 byte ölçümü bunların hiçbirini doğrulamaz.

## Yeni güvenli çıktı

Probe sonuç JSON'una protocolDiagnostics eklenir. En fazla 64 olay içerir;
mevcut frame sınırı ve ilk hatada durma bunu sınırlar. Her olay yalnız:

- category: unexpected_notification, schema_mismatch, duplicate_response,
  unexpected_response, unexpected_request veya startup_notification;
- phase: before_response/after_response (geçerli initialize yanıtına göre);
- frame: 1 tabanlı sınırlı mesaj sayacı;
- method: açık raporlama allowlist'indeki warning/configWarning/deprecationNotice
  veya unknown; allowlist dışında bilinen tool/approval yöntemleri de unknown;
- field/issue: sabit beklenen alan sınıfı ve missing/invalid/unexpected_field.

Yalnız ilk şema sorunu özetlenir. Dinamik anahtarlar, Zod mesajları, değerler,
bilinmeyen yöntem dizeleri, body, yollar, stdout/stderr, prompt veya credential
çıktıya aktarılmaz. field=path yalnız sabit alan adıdır, yol değeri değildir.
Ledger şeması değişmez. Tüm server/tool/approval istekleri reddedilir;
yalnız initialize/initialized yazılır; inference kapalı, retry=0.
Job Object ownership, deadline, byte sınırları, cleanup ve credentials
izolasyonu değişmez. Önceki iki olayın plan/profile/ledger/evidence dosyaları
okunmadı, değiştirilmedi veya silinmedi; önceki raporlar aynen bırakıldı.
Mevcut build dizininde probe kanıtı bulunduğu için tam doğrulama yalnız
izlenen kaynakların yeni geçici kopyasında yapıldı, eski dist yenilenmedi.

## Doğrulama

18 yeni sentetik regresyon testi önce boş tanı listesi nedeniyle kırmızı,
sonra yeşil görüldü. Odaklı handshake koşusu: 44/44 geçti. Üç meşru bildirim
yanıt öncesi ve cleanup sırasında; unknown method, eksik/geçersiz alan,
ek anahtar, thread hedefi, range, tool/approval, duplicate/diğer yanıt ve
hassas sentetik değerlerin çıktıda bulunmaması denetlendi.
İlk kırmızı koşuda pnpm test argüman iletimi tüm suite'i çalıştırdı;
mevcut native rapid-restart testinde ayrıca exited polling timeout gözlendi.
Bu native davranışa düzeltme yapılmadı.

- İzole kopyada pnpm verify: exit 0; lint/typecheck/build ve 22 dosyada
  175/175 test geçti (59,57 s test süresi). İlk native polling hatası bu
  koşuda tekrarlanmadı; kök nedeninin giderildiği iddia edilmez.
- pnpm audit --prod: exit 0, bilinen güvenlik açığı yok.
- Prettier ve git diff --check geçti. Build'de mevcut Vite >500 kB uyarısı
  ve geçici build dizini nedeniyle MSVC MSB8029 uyarısı görüldü.
- İlk pnpm test:desktop: layout/CSP/discovery/ConPTY kontrollerinden sonra
  timeout, exit 1. Kod/deadline değiştirilmeden bağımsız tekrar çalıştırıldı.
- İkinci pnpm test:desktop: exit 0; layout/focus, CSP, sessions/v1 kapısı,
  discovery, ConPTY, navigation/session cleanup ve SQLite/mock/human-accept
  kontrolleri geçti. İlk timeout'un kök nedeninin çözüldüğü iddia edilmez.

## Sonraki ayrı testin ölçümü

Bu çalışma yeni probe planı hazırlamadı veya çalıştırmadı. Ayrı insan onayıyla
yeni boş ve izole build/test dizininde, mevcut hash ve policy kontrollerinden
sonra tek deneme yapılabilir. Önceki iki dizin yeniden kullanılmamalı.
Yeni çıktı hangi frame'in hangi sınıfta reddedildiğini, bilinen yöntemi,
eksik/geçersiz beklenen alanı ve bildirimin yanıt öncesi/sonrası konumunu
gösterecek. Bunlar cleanup, outputDrained, byte sayıları, providerExitCode ve
süreyle birlikte değerlendirilecek. Raw transcript toplanmayacak;
inference kapalı, credentials aktarımı yok, retry=0 kalacak.
