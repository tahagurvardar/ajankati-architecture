# UI Sprint 2.1 — Onaylı A+C cilası (çekmece, yol, ofis, kompakt yerleşim)

7 Kasım 2026. Dal: `feat/ui-sprint-2-1-drawer-polish`. Kapsam: yalnız React/CSS/UI testleri
(+ mevcut Electron duman testine UI kontrolleri). Main, preload, worker, contracts, şema,
sağlayıcı başlatma, yönetilen görev onayları, oturum güvenliği, IPC ve CSP/izinler **değişmedi**.
`design-reference/ac-v1/` izlenmiyor ve PR'a eklenmedi.

## Tasarım kaynakları

- Okunanlar: devir notu, tasarım notları, orijinal sahne PNG'si (`office-scene-ac.png`),
  prototip CSS'indeki hotspot yüzdeleri.
- **Figma 13:19 yine İNCELENMEDİ** (bu oturumda Figma erişimi yok). Görsel yetki: onaylı
  notlar, prototip ve gerçek sahne görseli.

## Görev A — Çekmece kaydırma

- Gerçek kaydırıcı: **belge (html)**. `.shell` `min-height:100vh`, kenar çubuğu `sticky`;
  ayrı bir iç kaydırıcı yok.
- `useScrollLock`: `html{overflow:hidden}`; kaydırma çubuğu genişliği `body` sağ dolgusuyla
  geri eklenir (yerleşim kayması yok); kapanışta eski değerler ve gerekirse `scrollTo(x,y)`.
  Yalnız CSSOM yazımı (nonce'lı stil CSP'siyle uyumlu).
- Çekmece: başlık sabit, yalnız `.drawer-main` kayar; `overscroll-behavior: contain` (kaydırma zinciri yok).
- Odak: açılış/geri yüklemede `preventScroll` → arka plan konumu odak yüzünden oynamaz.
  Esc, Tab tuzağı, tetikleyiciye dönüş korunur. Temizleme `useEffect` dönüşünde; sızıntı yok.

## Görev B — Yürütülebilir yol

- Kısa gösterim (`C:\…\klasör\dosya.exe`, UNC ve POSIX dahil), tam yol `title` + "Tam yolu göster"
  (salt-okunur, seçilebilir alan).
- **Yolu kopyala** yalnız tıklamayla. Sıra: Clipboard API → `execCommand('copy')` (izin gerektirmez)
  → seçili metin yedeği ("Pano kullanılamadı… Ctrl+C"). Hiçbir ağ çağrısı yok; main/CSP/izinler aynen.

## Görev C — Bilgi hiyerarşisi

Bölüm başlıkları (Doğrulanan bilgiler / Yürütülebilir dosya / Çalışma durumu / Yetenekler ve izinler /
Sonraki adım), 13–14 px metin, yetenekler varsayılan **kapalı** açılır bölüm (özet:
"N doğrulandı · M bilinmiyor · K desteklenmiyor"), durumlar sözcük + simgeyle ayrılır (✓ / ? / —),
bilinmeyen yetenek anahtarı "Bilinmeyen yetenek (anahtar)" ve "Bilinmiyor" olarak görünür;
çekmece genişliği `clamp(360px, 32vw, 480px)`, `max-width:100vw`, `100dvh`.
Devre dışı terminal düğmesi artık soluk birincil düğme değil; kesikli çerçeveli nötr kutuda
görünür gerekçeyle. Claude ve Codex aynı bileşeni kullanır.

## Görev D — Ofis etkileşimleri

- Gerçek sahne görseli incelendi: resimde **6 etiketli karakter** (Claude, Codex, Araştırmacı,
  Analizci, Testçi, Raporcu) ve **Kat 2/Kat 1/Zemin seçici resmin içine gömülü**. Yalnız 4 gerçek
  hedef var; Analizci/Raporcu/Kat seçici tıklanmaz ve işlevsel yapılmadı.
- **Bulunan hata:** hotspot'lar sol-üst köşeden konumlandığı için hizasızdı; Test/QA hotspot'u
  (%79,%76) Testçi karakterinden (~%64) çok uzaktaydı. Hotspot'lar artık merkezden
  (`translate:-50% -50%`) ve karakter başlarına göre: Claude 16.5/51, Codex 46.7/53,
  Araştırma 55.5/30.5, Test/QA 64.3/76.5 (% — 2000×932 sahnede ölçüldü).
- Piksel kimliği: yuvarlak yerine köşeli işaret, katı gölge. Hover/odak: ölçek + ad/rol etiketi
  (yalnız CSS, animasyon yok); klavye odağında 3 px kontrastlı halka. Başlık metni 4 hedefi ve
  statik karakterleri açıkça ayırır. Hareket/etkin ajan simülasyonu yok.

## Görev E — Kompakt Windows yerleşimi

`max-height: 920px` altında üst çubuk, başlık, bilgi şeridi, KPI kartları ve kenar çubuğu boşlukları
azaltıldı; yazı boyutları okunur kaldı. Electron'da ölçülen sahne üst konumu (css px):
1366×768, 1440×900, 1600×900: **447** (önceki kurallar altında 1080 px yükseklikteki ölçüm 577; 768/900 için ayrıca ölçülmedi, aynı CSS varsayımıyla ≈577). 1920×1080: 577 (değişmedi,
yeterli yükseklik). Ek bağımsız kaydırıcı: **0** (tüm boyutlarda ölçüldü).

## Doğrulama (Windows x64, Node 24.20.0, pnpm 11.25.0, Electron 45.0.0)

| Kontrol | Sonuç |
| --- | --- |
| `pnpm install --frozen-lockfile` | Başarılı |
| `pnpm verify` | Lint, typecheck, build, **37/37 dosya, 443 test geçti, 1 atlandı** |
| `pnpm test:desktop` | Geçti: 1366×768, 1440×900, **1600×900**, 1920×1080, 125 % yakınlaştırma, dar pencere; kilit/konum/Esc/odak/taşma kontrolleri dahil |
| `pnpm audit --prod` | Bilinen açık yok |
| `git diff --check` | Temiz (yalnız CRLF uyarıları) |

Yeni testler: `tests/drawer-polish.test.tsx` — **15 test** (kaydırma kilidi ve geri yükleme, 6 tekrarlı
aç/kapat, backdrop/gezinme/unmount ile serbest bırakma, kaydırma zinciri CSS sözleşmesi, Tab/Esc
tuzağı, yol kısaltma, tam yol + elle kopyalama, pano hatası → eski kopya → seçili metin, açılır
bölüm, bilinmeyen yetenek, devre dışı düğme, Claude/Codex tutarlılığı, 4 hedef/sahte ajan yok,
hotspot hizası ve geri bildirim, taşma CSS sözleşmesi). Atlanan 1 test mevcut `context.skip`'tir.
Duman testi: `tests/fixtures/desktop-smoke.cjs` (1600×900 ve çekmece kilidi/konum kontrolleri eklendi).

Ekran görüntüleri (git dışı): `apps/desktop/dist/ui-sprint-2/agent-drawer-*.png`,
`office-hotspot-focus-*.png` (4 boyut).

## Kalan sınırlamalar

- Gerçek Electron'da **pano davranışı doğrulanmadı**: main tüm izinleri reddeder, bu yüzden
  `navigator.clipboard` büyük olasılıkla reddedilir; `execCommand` veya seçili metin yedeği devreye girer.
  İzinler bilerek gevşetilmedi. Otomasyon yalnız jsdom'da (üç yol da) test edildi.
- Hotspot hizası ölçüm + ekran görüntüsüyle kontrol edildi; piksel düzeyinde insan onayı yok.
  İşaret karakterin bir kısmını örter.
- Resme gömülü etiket ve Kat seçici kasıtlı olarak işlevsiz; tek görsel olduğundan gizlenemez.
- Kaydırma zinciri/dokunmatik davranışı Chromium'da `overscroll-behavior` ile sağlanır; fiziksel
  tekerlek/dokunmatik cihaz testi yapılmadı. Ekran okuyucu ve OS ölçekleme matrisi test edilmedi.
- Kompakt yerleşimde sahne 768 px yükseklikte hâlâ ilk ekranın altında başlar (447 px); daha fazlası
  KPI/uyarı içeriğini kırpmayı gerektirir.
- Vite JS parçası ~594 kB (500 kB uyarısı sürer).
