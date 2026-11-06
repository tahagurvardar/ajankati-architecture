# Codex 0.164.0 başlangıç bildirimi uyumluluğu

## Sabitlenmiş kaynak kanıtı

İnceleme yalnız resmi `rust-v0.164.0` etiketi üzerinde yapıldı:

- [app-server/src/lib.rs](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/lib.rs): yeni initialize edilmiş bağlantıya `RemoteControlStatusChanged` gönderiliyor. Bu bildirim remote control etkinleştirme isteği değildir.
- [protocol/v2/remote_control.rs](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-protocol/src/protocol/v2/remote_control.rs): camelCase payload; `status`, `serverName`, `installationId`, nullable `environmentId`. Durum enum'u `disabled`, `connecting`, `connected`, `errored`.
- [protocol/common.rs](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server-protocol/src/protocol/common.rs): yöntem `remoteControl/status/changed`; zarf `emittedAtMs: Option<i64>` tanımlar. `serialize_client_notification` testi kanonik istemci bildirimini yalnız `{"method":"initialized"}` olarak doğrular; params alanı yoktur.
- [app-server/src/outgoing_message.rs](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/app-server/src/outgoing_message.rs): gönderici bildirim zarfına Unix milisaniye zamanını ekliyor.

Bu davranış mevcut allowlist ve strict zarfla uyumsuzdu. Gerçek olayın
`unexpected_notification / unknown / after_response / frame=2` tanısı sentetik
JSONL ile yeniden üretildi. Ham olay mesajı toplanmadığından gerçek frame'in
kesinlikle bu yöntem olduğu iddia edilmez.

## Dar kapsamlı düzeltme ve korumalar

Yalnız initialize-only yolu değişti. Yeni yöntemin payload ve zarfı strict;
enum kapalı, kimlik dizeleri en fazla 4096 UTF-16 kod birimi. Upstream String
boşluğu yasaklamadığından boş dize kabul edilir; environmentId yok/null/dize
olabilir. Bu yerel uzunluk sınırı upstream'den daha dardır.

Dört izinli bildirimde emittedAtMs yok/null veya JS güvenli tamsayı aralığında
olabilir: -9007199254740991..9007199254740991. İşaretli i64 ile uyum için negatif
değerler kabul edilir; kesirler, yanlış türler ve kayıplı büyük sayılar reddedilir.
Alan yalnız geçici doğrulanır; sıralama, süre veya yetkilendirme için kullanılmaz.
Kanonik initialized artık params olmadan gönderilir. Genel CodexSession yolu
bu initialize-only düzeltmesinin kapsamında değildir.

Tanıya yalnız sabit yöntem adı eklenir. Kimlikler, durum değeri, zamanlar,
payload, stdout/stderr veya dinamik anahtarlar loglanmaz/persist edilmez.
Yeni alan hataları mevcut kapalı envelope/issue tanısına indirgenir.
Method+id, araç/approval istekleri, bilinmeyen yöntemler ve ek alanlar reddedilir.
İlk hata, UTF-8/JSON/framing sınırları, 64 frame/262144 byte sınırları, deadline,
drain, cleanup ve native Job Object containment değişmedi. Retry eklenmedi.

## Doğrulama

45 sentetik test eklendi. Üretim değişikliğinden önce 33 başarısız / 56 başarılı;
düzeltmeden sonra odaklı handshake koşusunda 89/89 başarılı. Testler dört enum
değerini, eksik/yanlış/taşan alanları, zaman sınırlarını, yanıt öncesini/sonrasını,
byte parçalanmasını, drain/cleanup sırasında bildirimi, ret davranışını ve
çıktı gizliliğini kapsıyor. Gerçek provider çıktısı fixture yapılmadı.

Tam doğrulama, yalnız izlenen kaynaklardan oluşturulan yeni geçici kopyada
yapıldı; iki değişen kod dosyasının SHA-256 değerleri çalışma dalıyla eşleşti.
Mevcut runtime/r1/r2 probe klasörleri, planlar ve ledger'lar değiştirilmedi.

- `pnpm install --frozen-lockfile`: exit 0; lockfile değişmedi.
- `pnpm verify`: exit 0; lint/typecheck/build ve 22 dosyada 220/220 test geçti.
- `pnpm test:desktop`: ilk koşuda exit 0; layout/focus, CSP, discovery,
  ConPTY, navigation/session cleanup ve SQLite/mock/human-accept geçti.
  Provider sürüm çalıştırma seçeneği kapalı tutuldu. Konsoldaki canlı pilot
  engeli ve geçersiz approvalToken retleri beklenen negatif kontrollerdi.
- `pnpm audit --prod`: exit 0; bilinen güvenlik açığı yok.
- Değişen kod dosyalarında Prettier ve `git diff --check` geçti.
- MSVC MSB8029 (geçici build dizini) ve Vite >500 kB uyarıları görüldü.
- Bu tam doğrulama ve desktop koşularında test hatası veya flaky tekrar yoktu;
  başarısız testleri gizleyen yeniden çalıştırma yapılmadı.
- İlk odaklı test başlatma girişimi pnpm store kilidinde sandbox erişim engeli
  aldı; test çalışmadan durdu. Yetkili çalıştırmada yukarıdaki red/green sonuçları
  alındı. Önceki çalışmada raporlanan native rapid-restart ve desktop timeout
  sorunlarının giderildiği iddia edilmez.

## Ayrı onay gerektiren canlı deneme

Bu çalışma gerçek Codex app-server başlatmadı; inference/ücretli API çağrısı,
remote control ayarı veya global yapılandırma değişikliği yapmadı.
Canlı handshake başarısı iddia edilmez.

Sonraki deneme ayrı açık insan onayıyla, yeni boş izole build/profil dizininde,
sabit 0.164.0 executable hash'i ve mevcut policy/containment kontrolleriyle
yapılmalıdır. Yeni tek kullanımlık plan/ledger hazırlanmalı; eski planlar,
ledger'lar ve runtime/r1/r2 kanıtları yeniden kullanılmamalı veya sıfırlanmamalı.
Yalnız initialize/initialized, inference kapalı, retry=0 ve mevcut credential
izolasyonu korunmalı. Yalnız kapalı tanı sözlüğü, byte sayaçları, cleanup ve
outputDrained gibi güvenli sonuçlar alınmalı; ham transcript, kimlikler veya
bildirim zamanları kaydedilmemelidir. Kaynak uyumu tek başına canlı zamanlama
ve diğer olası startup bildirimlerinin uyumunu kanıtlamaz.
