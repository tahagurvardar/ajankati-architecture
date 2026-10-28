import { useState } from "react";
import type { Snapshot } from "@ajankati/contracts";
import type { Route } from "./AppShell";
import { taskLabels } from "./taskLabels";
import officeScene from "./assets/office-scene-ac.png";
import "./overview.css";

export function Overview({
  data,
  onNavigate,
}: {
  data: Snapshot | null;
  onNavigate: (route: Route) => void;
}) {
  const [mode, setMode] = useState<"office" | "panel">("office");
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
        </div>
        {mode === "office" ? (
          <figure className="office-scene">
            <figcaption>
              <strong>TASARIM ÖNİZLEMESİ — CANLI OFİS DEĞİL</strong>
              <span>
                Karakterler, durum işaretleri ve kat düğmeleri statik görselin
                parçasıdır.
              </span>
            </figcaption>
            <img
              src={officeScene}
              alt="Statik A+C ofis konsepti: sıcak ahşap masalar, bitkiler, kod, araştırma ve toplantı alanları. Gerçek ajan durumu göstermez."
            />
          </figure>
        ) : (
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
        )}
      </section>
      <div className="overview-lower">
        <section className="info-card">
          <h2>Gerçek durum</h2>
          <p>
            CLI keşfi ve sürüm kontrolü kullanılabilir. Bulunmak veya sürümü
            doğrulanmak, çalışan ajan olmak değildir.
          </p>
          <button className="text-button" onClick={() => onNavigate("agents")}>
            CLI envanterini aç
          </button>
        </section>
        <section className="info-card">
          <h2>Kontrol sizde</h2>
          <p>
            Demo teslimleri insan kabulünü bekler. Proje kaydı dosyalarınıza
            erişim izni vermez.
          </p>
          <button
            className="text-button"
            onClick={() => onNavigate("projects")}
          >
            Demo görevlerini incele
          </button>
        </section>
        <section className="info-card">
          <h2>Hızlı işlemler</h2>
          <div className="quick-actions">
            <button
              className="secondary"
              onClick={() => onNavigate("projects")}
            >
              + Yeni proje
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
