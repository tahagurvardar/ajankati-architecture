import { useEffect, useState } from "react";
import type { SessionApi, SessionState } from "@ajankati/contracts";

const labels = {
  starting: "Başlatılıyor",
  running: "Çalışıyor",
  awaiting_approval: "Onay gerekli",
  stopping: "Durduruluyor",
  completed: "Tur tamamlandı",
  failed: "Başarısız",
  cancelled: "İptal edildi",
  interrupted: "Kesildi",
};
export function SessionsPanel({ api }: { api: SessionApi }) {
  const [state, setState] = useState<SessionState>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    void api
      .list()
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [api]);
  return (
    <section className="agents-panel" aria-labelledby="usage-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">RAPORLAR</p>
          <h2 id="usage-title">Maliyet ve Kullanım</h2>
        </div>
        <span className="badge">CODEX PİLOTU KAPALI</span>
      </div>
      <p>
        Gerçek oturum başlamadan önce proje, çalışma kapsamı ve maliyeti
        bilinmeyen sınırlı kullanım için açık onay gerekir. Başlatma onayı
        araçlara, dosya yazmaya veya dış işlemlere izin vermez.
      </p>
      <button disabled>Onayla ve Codex oturumu başlat</button>
      {error && (
        <p role="alert">
          Oturum kayıtları alınamadı; kullanım sıfır kabul edilmez.
        </p>
      )}
      {!state && !error && <p role="status">Oturum kayıtları yükleniyor…</p>}
      {state && (
        <>
          <h3>Başlatmayı engelleyen kontroller</h3>
          <ul>
            {state.capability.blockers.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>
            Job Object yalnız süreç yaşam döngüsünü sınırlar; dosya/ağ sandbox’ı
            değildir.
          </p>
          {state.sessions.length === 0 ? (
            <p>Henüz gerçek Codex oturumu yok.</p>
          ) : (
            <div className="agent-grid">
              {state.sessions.map((row) => (
                <article className="agent-card" key={row.sessionId}>
                  <h3>Codex · {labels[row.status]}</h3>
                  <dl>
                    <dt>Proje / Koşu / Oturum</dt>
                    <dd className="agent-path">
                      {row.projectId} / {row.runId} / {row.sessionId}
                    </dd>
                    <dt>CLI sürümü</dt>
                    <dd>{row.cliVersion}</dd>
                    <dt>Başlangıç</dt>
                    <dd>{new Date(row.startedAt).toLocaleString("tr-TR")}</dd>
                    <dt>Bitiş</dt>
                    <dd>
                      {row.endedAt
                        ? new Date(row.endedAt).toLocaleString("tr-TR")
                        : "Bilinmiyor"}
                    </dd>
                    <dt>Süre</dt>
                    <dd>
                      {row.durationMs === null
                        ? "Bilinmiyor"
                        : `${row.durationMs} ms`}
                    </dd>
                    <dt>Yeniden deneme</dt>
                    <dd>{row.retryCount}</dd>
                    <dt>Ölçülen token</dt>
                    <dd>{row.totalTokens ?? "Bilinmiyor"}</dd>
                    <dt>Maliyet / Kota</dt>
                    <dd>Bilinmiyor / Bilinmiyor</dd>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <p>
        Abonelik kotası API faturası değildir. Token verisi yalnız doğrulanmış
        sağlayıcı olayından alınır; bilinmeyen maliyet sıfır ücret değildir.
      </p>
    </section>
  );
}
