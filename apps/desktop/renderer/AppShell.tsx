import { useEffect, useRef, type ReactNode } from "react";

export const routes = {
  overview: [
    "Genel Bakış",
    "Yerel çalışma alanınız, görev akışı ve ofis tasarımı tek yerde.",
    "⌂",
  ],
  projects: [
    "Projeler / Görevler",
    "Bir hedef belirleyin, demo teslimini inceleyin, kararı siz verin.",
    "▦",
  ],
  agents: [
    "Ajanlar",
    "Yerel CLI envanteri ve açık onaylı sürüm kontrolleri.",
    "♙",
  ],
  approvals: ["Onaylar", "İnsan kararları ve izinler için ayrılan alan.", "◎"],
  knowledge: [
    "Bilgi Kaynakları",
    "Proje bilgisi ve bağlam için ayrılan alan.",
    "▤",
  ],
  reports: [
    "Raporlar",
    "Kalite ve performans raporları için ayrılan alan.",
    "◫",
  ],
  terminal: [
    "Terminaller",
    "Windows ConPTY ile sınırlı, güvenli yankı testi.",
    "⌘",
  ],
  integrations: [
    "Entegrasyonlar",
    "Gelecekteki araç ve hizmet bağlantıları.",
    "◇",
  ],
} as const;
export type Route = keyof typeof routes;

export function AppShell({
  route,
  onNavigate,
  busy,
  onRefresh,
  children,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  busy: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(route);
  useEffect(() => {
    if (previous.current !== route) {
      heading.current?.focus();
      previous.current = route;
    }
  }, [route]);
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        İçeriğe geç
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            A
          </span>
          <div>
            AjanKatı<small>Geliştirme merkezi</small>
          </div>
        </div>
        <nav aria-label="Ana menü">
          {Object.entries(routes).map(([key, [label, , icon]]) => (
            <button
              key={key}
              data-route={key}
              className="nav-item"
              aria-current={route === key ? "page" : undefined}
              onClick={() => onNavigate(key as Route)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="workspace-avatar" aria-hidden="true">
            AK
          </span>
          <div>
            Yerel çalışma alanı<small>UI Sprint 1 · Demo</small>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <span>
            Çalışma alanı <span aria-hidden="true">/</span>{" "}
            <strong>{routes[route][0]}</strong>
          </span>
          <span className="local-label">Yerel kayıtlar</span>
        </div>
        <main id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {routes[route][0]}
              </h1>
              <p>{routes[route][1]}</p>
            </div>
            <button className="secondary" disabled={busy} onClick={onRefresh}>
              Yenile
            </button>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
