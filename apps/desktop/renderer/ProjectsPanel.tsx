import { useRef, useState, type FormEvent } from "react";
import type {
  DesktopApi,
  Snapshot,
  Task,
  TaskStatus,
} from "@ajankati/contracts";
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
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const projectInput = useRef<HTMLInputElement>(null);
  const taskInput = useRef<HTMLInputElement>(null);
  const present = (Object.keys(labels) as TaskStatus[]).filter((status) =>
    tasks.some((t) => t.status === status),
  );
  // A filter whose tasks are gone (e.g. project switch) falls back to all.
  const active = filter !== "all" && present.includes(filter) ? filter : "all";
  const visible =
    active === "all" ? tasks : tasks.filter((t) => t.status === active);
  // The submit button disables itself once the field clears; keep keyboard focus on the field.
  const keepFocus =
    (submit: (event: FormEvent) => void, field: typeof taskInput) =>
    (event: FormEvent) => {
      submit(event);
      field.current?.focus();
    };
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
              <small>
                {data.tasks.filter((t) => t.projectId === p.id).length} görev
              </small>
            </button>
          ))}
        </nav>
        <form onSubmit={keepFocus(projectSubmit, projectInput)}>
          <label htmlFor="project-name">Yeni proje adı</label>
          <input
            ref={projectInput}
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
        <form className="task-form" onSubmit={keepFocus(taskSubmit, taskInput)}>
          <label htmlFor="task-title">Yeni görevin hedefi</label>
          <div>
            <input
              ref={taskInput}
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
        {present.length > 0 && (
          <div
            className="task-filter"
            role="group"
            aria-label="Görev durumu süzgeci"
          >
            <button
              className="chip"
              aria-pressed={active === "all"}
              onClick={() => setFilter("all")}
            >
              {`Tümü · ${tasks.length}`}
            </button>
            {present.map((status) => (
              <button
                key={status}
                className="chip"
                aria-pressed={active === status}
                onClick={() => setFilter(status)}
              >
                {`${labels[status]} · ${tasks.filter((t) => t.status === status).length}`}
              </button>
            ))}
          </div>
        )}
        <div className="tasks">
          {tasks.length === 0 ? (
            <div className="empty">
              <span>◇</span>
              <h3>Bir sonraki adım burada başlar</h3>
              <p>Önce bir proje, ardından küçük bir görev oluşturun.</p>
            </div>
          ) : (
            visible.map((t) => (
              <article className="task" key={t.id}>
                <div className="task-top">
                  <span className={`status ${t.status}`}>
                    {labels[t.status]}
                  </span>
                  <small>Revizyon {t.revision}</small>
                </div>
                <h3>{t.title}</h3>
                {t.result && <pre>{t.result}</pre>}
                {t.status === "awaiting_review" && t.resultHash && (
                  <p className="hash">
                    Kabul edilecek teslim özeti (SHA-256):{" "}
                    <code>{t.resultHash.slice(0, 16)}…</code> · Revizyon{" "}
                    {t.revision}
                  </p>
                )}
                <div className="actions">
                  {["draft", "interrupted", "failed"].includes(t.status) && (
                    <button
                      aria-label={`Hazırla: ${t.title}`}
                      disabled={busy}
                      onClick={() =>
                        void apply(() => api.ready(t.id, t.revision))
                      }
                    >
                      Hazırla
                    </button>
                  )}
                  {t.status === "ready" && (
                    <>
                      <button
                        aria-label={`Demo ajanını çalıştır: ${t.title}`}
                        aria-describedby={
                          running ? `run-note-${t.id}` : undefined
                        }
                        disabled={busy || running}
                        onClick={() =>
                          void apply(() => api.run(t.id, t.revision))
                        }
                      >
                        Demo ajanını çalıştır
                      </button>
                      {running && (
                        <small id={`run-note-${t.id}`}>
                          Başka bir demo görev çalışıyor; bitince
                          başlatılabilir.
                        </small>
                      )}
                    </>
                  )}
                  {t.status === "awaiting_review" && (
                    <button
                      aria-label={`Teslimi kabul et: ${t.title}`}
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
                      aria-label={`İptal et: ${t.title}`}
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
