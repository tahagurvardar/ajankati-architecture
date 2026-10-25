# Faz 1A sonrası Windows / ConPTY doğrulama prosedürü

Bu prosedür henüz tamamlanmış Windows-native uyumluluk kanıtı değildir. Faz 1A yalnız mock worker temelidir. `docs/01–12` güvenlik kapıları geçerlidir; aşağıdaki deneyler gelecek kilometre taşına aittir.

## 1. Temel sürümü Windows 11 x64 üzerinde çalıştırma

Ayrı test hesabı ve yerel NTFS dizini kullanın. Node 24.15+ x64 / pnpm 11.25.0 sürümlerini rapora yazın. Üretim credential veya Munder Difflin projesini test girdisi yapmayın.

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
pnpm demo
pnpm test:desktop
pnpm start
```

Türkçe proje/görev, mock etiketi, insan kabulü, iptal ve pencere kapatıp açınca kalıcılığı elle denetleyin. Task Manager'da ayrı worker sürecini doğrulayın; normal kapanışta sonlanmalı. `node:sqlite` Electron worker runtime'ında yüklenmeli. GUI metinleri okunmalı, klavye odağı görünmeli. Başarısız testin adı, çıkış kodu ve ortamı kaydedilmeli; Linux sonucu Windows sonucu diye yazılmamalı.

## 2. Sonraki küçük ConPTY dilimi

Önce `node-pty`/ConPTY ve görünür terminal adaptörü ayrı modülde eklenecek. Hosted API veya ücretli model çağrısı gerekmez. Onaylı test executable'ı ve geçici proje klasörü seçin; kullanıcı global PATH, CLI/MCP/skill config veya auth dosyasını değiştirmeyin. İlk test bir yankı/test süreci olabilir; gerçek sağlayıcı desteği diye sunmayın.

| Deney | Kabul kanıtı |
|---|---|
| Boşluklu/Türkçe yol | Gerçek executable ve cwd kimliği, `İ ı Ş ş Ğ ğ` kayıpsız girdi/çıktı |
| Çok satır ve özel karakter | `& | > < ^ % !` shell birleştirmesine dönüşmeden taşınır |
| Resize / Ctrl+C / exit | Boyut doğru; yalnız sahip olunan süreç kesilir; exit olayı task başarısı sayılmaz |
| İki terminal/input sahibi | Ayrı session/run; yanlış oturuma giriş veya kör Enter yok |
| Worker/GUI kaybı | Yetim alt süreç yok; eski epoch yeni koşuya karışmaz |
| Terminal flood | PTY 2 MiB ring / xterm 5.000 satır / istemci kuyruğu sınırları; sıra boşluğu görünür |

Bu dilim ConPTY teknik kanıtını verir; Claude/Codex otomasyonu veya OS sandbox kanıtı vermez. Henüz native paketleme, installer/imza veya 8 GB kaynak hedefinin doğrulandığı iddia edilmez.

## 3. Gerçek CLI kapısı — daha sonraki adım

Her CLI için desteklenen gerçek sürüm/protokol resmi kaynakla sabitlenir. Kullanıcı test hesabında girişini kendisi yapar; uygulama auth'u okumaz/kopyalamaz. Gerçek model isteği gerekiyorsa ayrı çalışma/harcama kapsamı gerekir. Test fixture'ları sırdan arındırılmalıdır.

- Oturum katmanının global ayar/hash'leri değiştirmediğini kontrollü sahte profille sınayın.
- Olay gözleme, araç öncesi gate, onay cevabı, dosya sandbox ve ağ sandbox yeteneklerini ayrı verified/unsupported/unknown kaydedin.
- DACL için başka kullanıcı erişiminin reddini; Job Object için worker çökünce yalnız sahip olunan çocukların sonlanmasını kanıtlayın.
- Yetkisiz dosya/ağ hedefini gerçek olumsuz testle deneyin. Worktree, cwd veya uygulama onayı tek başına sandbox değildir.
- Kanal kaybında fail-closed, parametre değişiminde eski onayın reddi ve belirsiz teslimde replay olmaması sınansın.

Kanıt formu: tarih, Windows build, CPU/RAM, Node/Electron/CLI/native modül sürümü, commit, test kimliği, tam komut (sırsız), çıkış kodu, beklenen/gözlenen davranış, rapor hash'i ve açık engeller. Bilinmeyen yetenek yönetilen/otonom modu kapalı tutar. Güvenli arka plan çalışma, named pipe DACL ve Job Object bu Faz 1A'da uygulanmamıştır.
