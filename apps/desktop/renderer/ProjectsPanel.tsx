import type { FormEvent } from "react";
import type { DesktopApi, Snapshot, Task } from "@ajankati/contracts";
import { taskLabels as labels } from "./taskLabels";

type Props = {
  api: DesktopApi;
  data: Snapshot;
  projectId: string;
  tasks: Task[];
  name: string;
  title: string;
  busy: boolean;
  running: boolean;
  setName: (value: string) => void;
  setTitle: (value: string) => void;
  setSelected: (value: string) => void;
  projectSubmit: (event: FormEvent) => void;
  taskSubmit: (event: FormEvent) => void;
  apply: (action: () => Promise<Snapshot>) => Promise<void>;
};
export function ProjectsPanel({
  api,
  data,
  projectId,
  tasks,
  name,
  title,
  busy,
  running,
  setName,
  setTitle,
  setSelected,
  projectSubmit,
  taskSubmit,
  apply,
}: Props) {
  return (
    <div className="projects-layout">
      <section className="project-picker" aria-label="Proje seçimi">
        <h2>
          Projeler <span className="pill">{data.projects.length}</span>
        </h2>
        <p>Yerel çalışma alanınız</p>
        <nav aria-label="Projeler">
          {data.projects.map((p) => (
            <button
              key={p.id}
              className={p.id === projectId ? "project selected" : "project"}
              aria-pressed={p.id === projectId}
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
        <p>Ad girerek proje oluşturun. Görev eklemek için bir proje seçin.</p>
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
    </div>
  );
}
