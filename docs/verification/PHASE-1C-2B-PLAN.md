# Phase 1C-2B — kontrollü Codex temeli

Kullanıcının 28 Ekim 2026 kapsamı uygulanır. Canlı inference için yetki yoktur.

## Tasarım ve karar

Resmi app-server stdio protokolü seçildi. PTY metni izin veya kullanım kaynağı değildir.
Mevcut diagnostic bootstrap genel executable/stdio başlatamaz; projelerde güvenilir
çalışma kökü de henüz yoktur. Genel spawn + sonradan Job association yarışlıdır.
Bu nedenle üretimde gerçek launcher eklenmez; canlı başlangıç değişmez kapıyla reddedilir.
Protokol yaşam döngüsü yalnız testlerin sağladığı taşıma üzerinde sınanır. Bu kanıt
Codex süreç sahipliği veya sağlayıcı sandbox kanıtı olarak gösterilmez.

## Uygulama sırası

1. `packages/contracts/src/sessions.ts`: sessions/v1, strict komutlar, capability
   engelleri, metadata-only ledger. Keyfi executable/argv/cwd/env ve Claude reddi.
2. `packages/storage/src/index.ts`: v1→v2 tutarlı VACUUM INTO yedeği, atomik migration,
   tek aktif session indeksi, kalıcı kayıt ve crash recovery; eski task verisi korunur.
3. `apps/worker/src/codex-session.ts`: bounded JSONL, initialize/thread/turn sırası,
   scoped olaylar, asla kabul edilmeyen provider istekleri, interrupt/deadline/cleanup.
   Test taşıması üretim başlatma kapısını değiştiremez. Otomatik retry/resume yok.
4. Worker/main/preload: sessions kanalı, worker tarafında tekrar doğrulama; üretim
   yalnız capability ve ledger okur, start fail-closed. UI A+C kartlarını kullanır.
5. Fixture, migration/recovery, IPC/UI testleri; pnpm verify, test:desktop, audit --prod.
   Mevcut Windows diagnostic ağacı/owner ölüm testleri tekrar çalışır.
6. Kanıt ve engelleri belgele; yalnız ilgili dosyaları commit et; PR aç, merge etme.

## İnceleme odağı

- Tekrarlanan/kapsam dışı provider olayları durum veya token çift sayımı üretmemeli.
- Bozuk/taşan protokol ve bilinmeyen provider isteği fail-closed sonlanmalı.
- Cleanup doğrulanmadıysa yeni session açılamamalı.
- Recovery tahmini bitiş zamanı/süre veya sıfır maliyet uydurmamalı.
- Migration başarısızlığı eski veriyi ve user_version değerini korumalı.

Model yetkisi, Windows sandbox/child ownership, auth/config izolasyonu, paketli gerçek
uyumluluk testleri geçmeden pilot açılamaz. RAM/CPU ölçülmediyse raporda öyle yazılır.
