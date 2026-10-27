import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { DesktopApi, Snapshot, TaskStatus } from "@ajankati/contracts";
const labels: Record<TaskStatus, string> = {
  draft: "Taslak",
  ready: "Hazır",
  running: "Çalışıyor",
  awaiting_review: "İnceleme bekliyor",
  succeeded: "Kabul edildi",
  failed: "Başarısız",
  cancelled: "İptal edildi",
  interrupted: "Kesildi",
};
export function Dashboard({
  api,
  terminal,
  agents,
}: {
  api: DesktopApi;
  terminal?: ReactNode;
  agents?: ReactNode;
}) {
  const [data, setData] = useState<Snapshot>({
    mode: "mock",
    projects: [],
    tasks: [],
    events: [],
  });
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apply = useCallback(async (action: () => Promise<Snapshot>) => {
    setBusy(true);
    setError("");
    try {
      setData(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    let live = true;
    void api
      .snapshot()
      .then((value) => {
        if (live) setData(value);
      })
      .catch(() => {
        if (live) setError("İşçiye bağlanılamadı.");
      });
    return () => {
      live = false;
    };
  }, [api]);
  const running = data.tasks.some((t) => t.status === "running");
  useEffect(() => {
    if (!running) return;
    let live = true;
    const timer = setInterval(() => {
      void api
        .snapshot()
        .then((value) => {
          if (live) setData(value);
        })
        .catch(() => {
          if (live)
            setError("İşçi bağlantısı kesildi. Yenileyerek kontrol edin.");
        });
    }, 500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [running, api]);
  const projectId = data.projects.some((p) => p.id === selected)
    ? selected
    : (data.projects[0]?.id ?? "");
  const tasks = data.tasks.filter((t) => t.projectId === projectId);
  function projectSubmit(e: FormEvent) {
    e.preventDefault();
    void apply(async () => {
      const next = await api.createProject(name);
      setSelected(next.projects.at(-1)!.id);
      setName("");
      return next;
    });
  }
  function taskSubmit(e: FormEvent) {
    e.preventDefault();
    void apply(async () => {
      const next = await api.createTask(projectId, title);
      setTitle("");
      return next;
    });
  }
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="mark">A</span>
          <div>
            AjanKatı<small>GELİŞTİRME MERKEZİ</small>
          </div>
        </div>
        <div className="nav-title">ÇALIŞMA ALANI</div>
        <div className="nav-item">◈ &nbsp; Görev merkezi</div>
        <div className="nav-title">
          PROJELER <span>{data.projects.length}</span>
        </div>
        <nav aria-label="Projeler">
          {data.projects.map((p) => (
            <button
              className={projectId === p.id ? "project selected" : "project"}
              key={p.id}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
            </button>
          ))}
        </nav>
        <form onSubmit={projectSubmit}>
          <label htmlFor="project-name">Yeni proje adı</label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
          />
          <button className="secondary" disabled={busy || !name.trim()}>
            + Proje oluştur
          </button>
        </form>
        <div className="sidebar-note">
          FAZ 1C-1 · CLI KEŞFİ
          <br />
          Veriler SQLite içinde saklanır.
          <br />
          Arka plan çalışması kapalı.
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">ÇALIŞMA ALANINA GENEL BAKIŞ</div>
            <h1>Görev merkezi</h1>
            <p>Bir hedef belirleyin, teslimi inceleyin, kararı siz verin.</p>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void apply(() => api.snapshot())}
          >
            Yenile
          </button>
        </header>
        <div className="demo">
          <span className="dot" />
          <div>
            <strong>Demo — gerçek ajan çalışmıyor</strong>
            <p>
              Yalnız sahte ajan kullanılır. Claude, Codex veya ücretli API
              çağrısı yapılmaz.
            </p>
          </div>
          <span className="badge">MOCK</span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <section className="metrics" aria-label="Görev özeti">
          <article>
            <span>Bu projede</span>
            <strong>{tasks.length}</strong>
            <small>toplam görev</small>
          </article>
          <article>
            <span>İnceleme kuyruğu</span>
            <strong>
              {tasks.filter((t) => t.status === "awaiting_review").length}
            </strong>
            <small>kararınızı bekliyor</small>
          </article>
          <article>
            <span>Tamamlanan</span>
            <strong>
              {tasks.filter((t) => t.status === "succeeded").length}
            </strong>
            <small>insan tarafından kabul edildi</small>
          </article>
        </section>
        <section className="workspace">
          <div className="section-heading">
            <div>
              <h2>
                {data.projects.find((p) => p.id === projectId)?.name ??
                  "İlk projenizi oluşturun"}
              </h2>
              <p>Proje kaydı dosyalarınıza erişim izni vermez.</p>
            </div>
            <span className="pill">YEREL · MOCK</span>
          </div>
          <form className="task-form" onSubmit={taskSubmit}>
            <label htmlFor="task-title">Yeni görevin hedefi</label>
            <div>
              <input
                id="task-title"
                placeholder="Örn. Türkçe karşılama ekranını incele"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                disabled={!projectId}
              />
              <button disabled={busy || !projectId || !title.trim()}>
                Görev ekle
              </button>
            </div>
          </form>
          <div className="tasks">
            {tasks.length === 0 ? (
              <div className="empty">
                <span>◇</span>
                <h3>Bir sonraki adım burada başlar</h3>
                <p>Önce bir proje, ardından küçük bir görev oluşturun.</p>
              </div>
            ) : (
              tasks.map((t) => (
                <article className="task" key={t.id}>
                  <div className="task-top">
                    <span className={`status ${t.status}`}>
                      {labels[t.status]}
                    </span>
                    <small>Revizyon {t.revision}</small>
                  </div>
                  <h3>{t.title}</h3>
                  {t.result && <pre>{t.result}</pre>}
                  <div className="actions">
                    {["draft", "interrupted", "failed"].includes(t.status) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void apply(() => api.ready(t.id, t.revision))
                        }
                      >
                        Hazırla
                      </button>
                    )}
                    {t.status === "ready" && (
                      <button
                        disabled={busy || running}
                        onClick={() =>
                          void apply(() => api.run(t.id, t.revision))
                        }
                      >
                        Demo ajanını çalıştır
                      </button>
                    )}
                    {t.status === "awaiting_review" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void apply(() =>
                            api.accept(t.id, t.revision, t.resultHash!),
                          )
                        }
                      >
                        Teslimi kabul et
                      </button>
                    )}
                    {!["succeeded", "cancelled"].includes(t.status) && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void apply(() => api.cancel(t.id, t.revision))
                        }
                      >
                        İptal et
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        {agents}
        {terminal}
        <footer>
          Bağımsız işçi · SQLite kalıcılığı · İnsan kabulü{" "}
          <span>Gerçek ajan oturumları / API / MCP etkin değil</span>
        </footer>
      </main>
    </div>
  );
}
