# UI Sprint 2 — Operatör çalışma alanı (onaylı A+C tasarımı)

7 Kasım 2026. Dal: `feat/ui-sprint-2-operator-workspace`. Kapsam: yalnız React/CSS/UI testleri.
Main, preload, worker, contracts, SQLite şeması, onay kapıları, CSP ve sandbox değişmedi.

## Tasarım kaynakları — gerçekten incelenenler

- **Figma 13:19: İNCELENMEDİ.** Bu oturumda Figma erişimi yoktu. Görsel yetki olarak
  paketteki notlar, HTML prototip ve 1600 px HTML render'ları kullanıldı; bunlar
  Figma ekran görüntüsü değildir.
- Okunanlar: `README-START-HERE.md`, `CLAUDE_UI_SPRINT2_DESIGN_HANDOFF.md`,
  `AjanKati_AC_UIUX_Tasarim_Notlari.md`, orijinal HTML'in tamamı (CSS + JS).
- Orijinal PNG sahnesi değişmedi; uygulamadaki mevcut kopya kullanıldı.
  `design-reference/ac-v1/` izlenmiyor (`.git/info/exclude`) ve PR'a eklenmedi.

## Prototipten çevrilen etkileşimler

| Prototip | React uygulaması |
| --- | --- |
| 4 ajan hotspot'u (aynı % konumları) | `Overview` → gerçek `<button>`; doğrulandı: Claude/Codex/Araştırmacı karakterleri üzerinde |
| Sağ çekmece | `AgentDrawer`: `role=dialog`, `aria-modal`, odak kapat düğmesine, Tab döngüsü, Esc/arka plan ile kapanır, odak hotspot'a döner |
| Ctrl+K arama | `SearchBox`: yalnız yerel proje/görev/ajan adı; ok tuşları, Esc temizler |
| Ofisi büyüt (⤢) | `aria-pressed` odak modu; Esc çıkar; gezinme çıkarır |
| Panel görünümü ajan kartları | "Ajan envanteri" bölgesi, aynı çekmeceyi açar |
| Anlık durum / Son aktiviteler / Hızlı işlemler | Gerçek snapshot ve `list()` verisiyle |
| Hızlı işlem "Yeni proje" | Proje adı alanına odaklanır |

Proje/görev: durum süzgeci (sayılarla), proje başına görev sayısı, eylem düğmelerinde
görev adı, kabul edilecek teslimin SHA-256 özeti, çalıştırma kapalıyken görünür gerekçe,
gönderim sonrası alanda odak korunur. Mevcut CRUD ve revizyon/hash kabulü aynen sürer.

## Dürüstlük sözleşmesi

- Çekmece yalnız mevcut salt-okunur `AgentApi.list()` yanıtını gösterir. `discover` ve
  `verify` çağrılmaz (testle doğrulanır); süreç başlatılmaz. Keşif/sürüm onayı yalnız
  Ajanlar ekranındadır.
- Test/QA ve Araştırma karakterleri "Tasarım rolü · bağlı ajan yok" olarak gösterilir.
- Prototipin 55/55, 2 CLI, sahte aktivite ve hareketli karakterleri **alınmadı**.
  "Son aktiviteler" yalnız snapshot olaylarıdır. Çalışan gerçek ajan her zaman 0.
- "Canlı ajan terminali" devre dışı ve gerekçesi görünür.

## Doğrulama (Windows x64, Node 24.20.0, pnpm 11.25.0, Electron 45.0.0)

| Kontrol | Sonuç |
| --- | --- |
| `pnpm install --frozen-lockfile` | Başarılı |
| `pnpm verify` | Lint, typecheck, build, **32/32 dosya, 416 test geçti, 1 atlandı** (art arda 2 temiz tur) |
| `pnpm test:desktop` | Geçti; 5 boyutta çekmece açma/sığma/taşma/odak/Esc kontrolü dahil |
| `pnpm audit --prod` | Bilinen açık yok |
| `git diff --check` | Temiz (yalnız CRLF uyarıları) |

Yeni testler: `tests/office-drawer.test.tsx` (8), `tests/projects-usability.test.tsx` (5).
Atlanan 1 test, `native-path-boundary.test.ts` içindeki mevcut çalışma zamanı `context.skip` koşuludur (HEAD'te de var).

## Gözlenen sorunlar ve sınırlamalar (dürüst kayıt)

- **Zaman aşımı kararsızlığı:** 32 dosyalı paralel `pnpm verify` turlarının 4'ünden
  2'si 5 sn varsayılan zaman aşımına takıldı (önce `dashboard.test.tsx`, sonra
  dokunulmayan `managed-preflight` ve `worker` testleri). Tek başına hepsi hızlı geçti
  (255 ms / 675 ms). `dashboard.test.tsx`: DOM büyüdüğü için ~1.7 sn → ~2.7 sn; bu
  testin süresi 20 sn'ye çıkarıldı. Backend testlerine dokunulmadı; yük altında
  kararsız kalabilirler. Sonraki iki tam tur temiz geçti.
- Çekmece görsel kontrolü: 1366×768, 1440×900, 1920×1080 PNG'leri
  `apps/desktop/dist/ui-sprint-2/` altında üretilir (git dışı). Yalnız araçla incelendi;
  insan elle kabulü, ekran okuyucu ve OS ölçekleme matrisi doğrulanmadı.
- Sapmalar: sekme çubuğu (Genel Bakış/Ajanlar/…) sidebar ile tekrar olacağı için
  alınmadı; bildirim/ayar simgeleri çalışmadığı için alınmadı; sidebar adları Sprint 1
  ile aynı bırakıldı.
- Çekmece, ajan kaydını açılışta ve her açışta okur; Ajanlar ekranındaki keşif sonrası
  Genel Bakış'a dönünce güncel görünür.
- Vite JS parçası ~590 kB (500 kB uyarısı sürer). Test dışı performans (8 GB) ölçülmedi.
