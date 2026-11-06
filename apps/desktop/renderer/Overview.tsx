import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentApi, AgentRecord, Snapshot } from "@ajankati/contracts";
import type { Route } from "./AppShell";
import { AgentDrawer } from "./AgentDrawer";
import {
  describeInventory,
  officeRoles,
  type InventoryState,
  type OfficeRole,
} from "./agentView";
import { taskLabels } from "./taskLabels";
import officeScene from "./assets/office-scene-ac.png";
import "./overview.css";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
function eventLabel(kind: string) {
  if (kind === "project.created") return "Proje oluşturuldu";
  if (kind === "task.created") return "Görev oluşturuldu";
  const status = kind.replace(/^task\./, "");
  return kind.startsWith("task.") && status in taskLabels
    ? `Görev: ${taskLabels[status as keyof typeof taskLabels]}`
    : kind;
}

export function Overview({
  data,
  onNavigate,
  onNewProject,
  agentApi,
  focus,
  onFocusChange,
}: {
  data: Snapshot | null;
  onNavigate: (route: Route) => void;
  onNewProject: () => void;
  agentApi?: AgentApi;
  focus: boolean;
  onFocusChange: (focus: boolean) => void;
}) {
  const [mode, setMode] = useState<"office" | "panel">("office");
  const [rows, setRows] = useState<AgentRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryState>(
    agentApi ? "loading" : "failed",
  );
  const [open, setOpen] = useState<OfficeRole | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Read-only list(): never discovers, verifies or launches anything.
  const refresh = useCallback(() => {
    if (!agentApi) return () => undefined;
    let live = true;
    void agentApi
      .list()
      .then((state) => {
        if (!live) return;
        setRows(state.integrations);
        setInventory("ready");
      })
      .catch(() => {
        if (live) setInventory("failed");
      });
    return () => {
      live = false;
    };
  }, [agentApi]);
  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    if (!focus || open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFocusChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus, open, onFocusChange]);
  function openAgent(role: OfficeRole, trigger: HTMLElement) {
    opener.current = trigger;
    setOpen(role);
    refresh();
  }
  function closeAgent(restoreFocus = true) {
    setOpen(null);
    if (restoreFocus) opener.current?.focus();
    opener.current = null;
  }
  const recordFor = (role: OfficeRole) =>
    rows.find((row) => row.integrationId === role.integrationId);
  const verified = rows.filter((row) => row.verified).length;
  const events = [...(data?.events ?? [])]
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 5);
  const entityName = (id: string) =>
    data?.projects.find((p) => p.id === id)?.name ??
    data?.tasks.find((t) => t.id === id)?.title ??
    "";
  return (
    <>
      <section className="metrics" aria-label="Çalışma alanı özeti">
        <article>
          <span className="metric-icon" aria-hidden="true">
            ▦
          </span>
          <div>
            <strong>{data?.projects.length ?? "—"}</strong>
            <span>Yerel proje</span>
            <small>Tüm projeler</small>
          </div>
        </article>
        <article>
          <span className="metric-icon" aria-hidden="true">
            ☷
          </span>
          <div>
            <strong>{data?.tasks.length ?? "—"}</strong>
            <span>Demo görev</span>
            <small>Tüm projeler · MOCK</small>
          </div>
        </article>
        <article>
          <span className="metric-icon" aria-hidden="true">
            ♙
          </span>
          <div>
            <strong>0</strong>
            <span>Çalışan gerçek ajan</span>
            <small>Gerçek oturumlar kapalı</small>
          </div>
        </article>
        <article>
          <span className="metric-icon" aria-hidden="true">
            ◫
          </span>
          <div>
            <strong className="metric-text">Ölçülmüyor</strong>
            <span>Performans</span>
            <small>Canlı telemetri yok</small>
          </div>
        </article>
      </section>
      <div className="overview-bar">
        <h2>Çalışma alanınız</h2>
        <span className="pill">A+C · Sıcak modüler ofis</span>
      </div>
      <section className="office-window" aria-label="Çalışma alanı görünümü">
        <div className="view-controls" role="group" aria-label="Görünüm seçimi">
          <button
            aria-pressed={mode === "office"}
            onClick={() => setMode("office")}
          >
            Ofis Görünümü
          </button>
          <button
            aria-pressed={mode === "panel"}
            onClick={() => setMode("panel")}
          >
            Panel Görünümü
          </button>
          <button
            className="expand"
            aria-pressed={focus}
            aria-label="Ofisi büyüt"
            title="Ofisi büyüt (Esc ile çık)"
            onClick={() => onFocusChange(!focus)}
          >
            <span aria-hidden="true">⤢</span>
          </button>
        </div>
        {mode === "office" ? (
          <figure className="office-scene">
            <figcaption>
              <strong>TASARIM ÖNİZLEMESİ — CANLI OFİS DEĞİL</strong>
              <span>
                Karakterler statik görselin parçasıdır. Daireler yalnız rol ve
                yerel CLI envanteri ayrıntısı açar; ajan çalıştırmaz.
              </span>
            </figcaption>
            <div className="scene-stage">
              <img
                src={officeScene}
                alt="Statik A+C ofis konsepti: sıcak ahşap masalar, bitkiler, kod, araştırma ve toplantı alanları. Gerçek ajan durumu göstermez."
              />
              {officeRoles.map((role) => (
                <button
                  key={role.key}
                  className="hotspot"
                  data-agent={role.key}
                  aria-haspopup="dialog"
                  aria-label={`${role.name} ayrıntılarını aç`}
                  title={role.name}
                  onClick={(event) => openAgent(role, event.currentTarget)}
                >
                  <span aria-hidden="true">{role.glyph}</span>
                </button>
              ))}
            </div>
          </figure>
        ) : (
          <>
            <section className="panel-view" aria-label="Proje özeti">
              <h3>Yerel projeler ve demo görevleri</h3>
              {!data ? (
                <p>Kayıtlar henüz alınamadı. Yenile ile tekrar deneyin.</p>
              ) : data.projects.length === 0 ? (
                <div className="empty">
                  <h3>Henüz proje yok</h3>
                  <p>
                    İlk projenizi oluşturup demo görev akışını deneyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="panel-grid">
                  {data.projects.map((project) => {
                    const tasks = data.tasks.filter(
                      (task) => task.projectId === project.id,
                    );
                    return (
                      <article className="summary-card" key={project.id}>
                        <span className="pill">DEMO / MOCK</span>
                        <h3>{project.name}</h3>
                        <p>{tasks.length} demo görev</p>
                        <ul>
                          {Object.entries(taskLabels).map(([status, label]) => {
                            const count = tasks.filter(
                              (task) => task.status === status,
                            ).length;
                            return count ? (
                              <li key={status}>
                                {label}: {count}
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              )}
              <button onClick={() => onNavigate("projects")}>
                Projeleri ve görevleri aç
              </button>
            </section>
            <section className="panel-agents" aria-label="Ajan envanteri">
              <h3>Ajan envanteri</h3>
              <p>
                Yalnız yerel CLI keşfi ve sürüm kontrolü. Çalışan gerçek ajan
                yoktur; roller tasarım temsilidir.
              </p>
              <div className="panel-grid">
                {officeRoles.map((role) => {
                  const record = recordFor(role);
                  const status = describeInventory(role, record, inventory);
                  return (
                    <article className="summary-card" key={role.key}>
                      <span className={`pill tone-${status.tone}`}>
                        {status.label}
                      </span>
                      <h3>{role.name}</h3>
                      <p>
                        {record?.detectedVersion
                          ? `Sürüm ${record.detectedVersion}`
                          : "Sürüm bilinmiyor"}
                      </p>
                      <button
                        className="secondary"
                        aria-label={`${role.name} ayrıntıları`}
                        onClick={(event) =>
                          openAgent(role, event.currentTarget)
                        }
                      >
                        Ayrıntılar
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </section>
      <div className="overview-lower">
        <section className="info-card" aria-label="Anlık durum">
          <h2>Anlık durum</h2>
          <ul className="statrows">
            <li>
              <b>{inventory === "ready" ? verified : "—"}</b>
              <span>CLI sürümü doğrulandı</span>
            </li>
            <li>
              <b>0</b>
              <span>Çalışan gerçek ajan</span>
            </li>
            <li>
              <b>
                {data
                  ? data.tasks.filter((t) => t.status === "awaiting_review")
                      .length
                  : "—"}
              </b>
              <span>Kabul bekleyen demo teslim</span>
            </li>
            <li>
              <b>
                {data
                  ? data.tasks.filter((t) => t.status === "running").length
                  : "—"}
              </b>
              <span>Çalışan demo görev</span>
            </li>
          </ul>
          <p>
            Bulunmak veya sürümü doğrulanmak, çalışan ajan olmak değildir.
            Teslimleri yalnız siz kabul edersiniz.
          </p>
          <button className="text-button" onClick={() => onNavigate("agents")}>
            CLI envanterini aç
          </button>
        </section>
        <section className="info-card" aria-label="Son aktiviteler">
          <h2>Son aktiviteler</h2>
          {!data ? (
            <p>Kayıtlar henüz alınamadı.</p>
          ) : events.length === 0 ? (
            <p>Henüz kayıtlı etkinlik yok.</p>
          ) : (
            <ul className="timeline">
              {events.map((event) => (
                <li key={event.sequence}>
                  <time dateTime={event.occurredAt}>
                    {time(event.occurredAt)}
                  </time>
                  <span>
                    <strong>{eventLabel(event.kind)}</strong>
                    {entityName(event.entityId) && (
                      <small>{entityName(event.entityId)}</small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="info-card">
          <h2>Hızlı işlemler</h2>
          <div className="quick-actions">
            <button className="secondary" onClick={onNewProject}>
              + Yeni proje
            </button>
            <button
              className="secondary"
              onClick={() => onNavigate("projects")}
            >
              Demo teslimlerini incele
            </button>
            <button className="secondary" onClick={() => onNavigate("agents")}>
              CLI envanteri
            </button>
            <button
              className="secondary"
              onClick={() => onNavigate("terminal")}
            >
              Test terminaline git
            </button>
          </div>
        </section>
      </div>
      {open && (
        <AgentDrawer
          role={open}
          record={recordFor(open)}
          inventory={inventory}
          onClose={() => closeAgent()}
          onOpenAgents={() => {
            closeAgent(false);
            onNavigate("agents");
          }}
        />
      )}
    </>
  );
}

const unavailable = {
  approvals: [
    "Merkezi onay kuyruğu henüz bağlı değil. Demo teslim kabulü Projeler / Görevler ekranında, CLI sürüm onayı Ajanlar ekranındadır.",
    "projects",
    "Demo teslimlerine git",
  ],
  knowledge: [
    "Bilgi deposu, proje hafızası ve dosya bağlantıları henüz bağlı değil. Bu ekrandan dosya okunmaz.",
    "projects",
    "Yerel projelere git",
  ],
  reports: [
    "Performans ve başarı oranı ölçülmüyor. Geliştirici test sonuçları canlı ürün telemetrisi değildir.",
    "overview",
    "Genel bakışa git",
  ],
  integrations: [
    "API, MCP ve skill bağlantıları henüz etkin değil. Mevcut CLI keşfi ve sürüm kontrolü Ajanlar ekranındadır.",
    "agents",
    "CLI envanterine git",
  ],
} as const;
export function UnavailableView({
  route,
  onNavigate,
}: {
  route: keyof typeof unavailable;
  onNavigate: (route: Route) => void;
}) {
  const [text, destination, action] = unavailable[route];
  return (
    <section className="placeholder workspace">
      <span className="placeholder-icon" aria-hidden="true">
        ◇
      </span>
      <h2>Henüz kullanılamıyor</h2>
      <p>{text}</p>
      <button className="secondary" onClick={() => onNavigate(destination)}>
        {action}
      </button>
    </section>
  );
}
