import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { DesktopApi, Snapshot } from "@ajankati/contracts";
import { AppShell, type Route } from "./AppShell";
import { Overview, UnavailableView } from "./Overview";
import { ProjectsPanel } from "./ProjectsPanel";
export function Dashboard({
  api,
  terminal,
  agents,
  reports,
}: {
  api: DesktopApi;
  terminal?: ReactNode;
  agents?: ReactNode;
  reports?: ReactNode;
}) {
  const [data, setData] = useState<Snapshot>({
    mode: "mock",
    projects: [],
    tasks: [],
    events: [],
  });
  const [route, setRoute] = useState<Route>("overview");
  const [visited, setVisited] = useState({ agents: false, terminal: false });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  function navigate(next: Route) {
    setRoute(next);
    if (next === "agents" || next === "terminal")
      setVisited((old) => ({ ...old, [next]: true }));
  }
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
      setLoaded(true);
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
        if (live) {
          setData(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (live) setError("İşçiye bağlanılamadı.");
      })
      .finally(() => {
        if (live) setLoading(false);
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
    <AppShell
      route={route}
      onNavigate={navigate}
      busy={busy || loading}
      onRefresh={() => void apply(() => api.snapshot())}
    >
      <div className="demo">
        <span className="dot" aria-hidden="true" />
        <div>
          <strong>Demo — gerçek ajan çalışmıyor</strong>
          <p>
            Yalnız demo görevleri. Claude, Codex veya ücretli API çağrısı
            yapılmaz.
          </p>
        </div>
        <span className="badge">DEMO / MOCK</span>
      </div>
      {loading && <p role="status">Yükleniyor… Yerel kayıtlar alınıyor.</p>}
      {busy && <p role="status">İşlem sürüyor…</p>}
      {error && (
        <div className="error" role="alert">
          {error} Yenile ile tekrar deneyin.
        </div>
      )}
      {route === "overview" && (
        <Overview data={loaded ? data : null} onNavigate={navigate} />
      )}
      <div hidden={route !== "projects"}>
        <ProjectsPanel
          api={api}
          data={data}
          projectId={projectId}
          tasks={tasks}
          name={name}
          title={title}
          busy={busy || loading || !loaded}
          running={running}
          setName={setName}
          setTitle={setTitle}
          setSelected={setSelected}
          projectSubmit={projectSubmit}
          taskSubmit={taskSubmit}
          apply={apply}
        />
      </div>
      <div hidden={route !== "agents"}>{visited.agents && agents}</div>
      <div hidden={route !== "terminal"}>{visited.terminal && terminal}</div>
      {route === "reports" && reports}
      {route !== "overview" &&
        route !== "projects" &&
        route !== "agents" &&
        route !== "terminal" &&
        (route === "reports" && reports ? null : (
          <UnavailableView route={route} onNavigate={navigate} />
        ))}
      <footer>
        Yerel kayıtlar · İnsan kabulü{" "}
        <span>Gerçek ajan oturumları / API / MCP etkin değil</span>
      </footer>
    </AppShell>
  );
}
