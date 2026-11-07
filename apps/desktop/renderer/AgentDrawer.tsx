import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { AgentRecord } from "@ajankati/contracts";
import { ExecutablePath } from "./ExecutablePath";
import { useScrollLock } from "./useScrollLock";
import {
  capabilityInfo,
  capabilityLabel,
  describeInventory,
  type InventoryState,
  type OfficeRole,
} from "./agentView";

const focusable = "button:not(:disabled), a[href], textarea:not([hidden])";

/**
 * Right-hand detail dialog for an office character. It only renders what the
 * worker's read-only agent inventory reports; it starts nothing itself.
 */
export function AgentDrawer({
  role,
  record,
  inventory,
  onClose,
  onOpenAgents,
}: {
  role: OfficeRole;
  record: AgentRecord | undefined;
  inventory: InventoryState;
  onClose: () => void;
  onOpenAgents: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [capsOpen, setCapsOpen] = useState(false);
  const capsId = useId();
  useScrollLock();
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items.at(-1)!;
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === first || !dialog.current?.contains(active))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !dialog.current?.contains(active))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  const status = describeInventory(role, record, inventory);
  const capabilityRows = Object.entries(record?.capabilities ?? {}).map(
    ([key, value]) => [key, capabilityInfo(value)] as const,
  );
  const count = (state: string) =>
    capabilityRows.filter(([, info]) => info.state === state).length;
  const capabilitySummary = `${count("verified")} doğrulandı · ${count("unknown")} bilinmiyor · ${count("unsupported")} desteklenmiyor`;
  const integration = role.integrationId !== null;
  return (
    <>
      <div
        className="drawer-backdrop"
        data-testid="drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialog}
        className="agent-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-drawer-title agent-drawer-name"
        onKeyDown={onKeyDown}
      >
        <div className="drawer-top">
          <h2 id="agent-drawer-title">Seçili ajan</h2>
          <button
            ref={close}
            className="drawer-close"
            aria-label="Ajan ayrıntılarını kapat"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="drawer-main">
          <div className="agent-ident">
            <span className="avatar" aria-hidden="true">
              {role.glyph}
            </span>
            <div>
              <strong id="agent-drawer-name">{role.name}</strong>
              <small>
                {integration ? "Yerel CLI envanteri" : "Tasarım rolü"}
              </small>
            </div>
          </div>
          <p className={`drawer-status ${status.tone}`}>{status.label}</p>
          <p className="drawer-note">
            {integration
              ? "Bulunmak veya sürümü doğrulanmak, çalışan ajan olmak değildir. Gerçek oturum ve görev yürütme kapalıdır."
              : "Bu karakter gelecekteki bir rolün tasarım temsilidir. Gerçek bir CLI çalışanına bağlı değildir; sürüm, durum veya görev gösterilmez."}
          </p>
          {integration && record && (
            <section aria-labelledby="drawer-h-verified">
              <h3 id="drawer-h-verified">Doğrulanan bilgiler</h3>
              <dl className="drawer-facts">
                <dt>Sağlayıcı</dt>
                <dd>{record.provider}</dd>
                <dt>Sürüm</dt>
                <dd>{record.detectedVersion ?? "Bilinmiyor"}</dd>
                <dt>Keşif</dt>
                <dd>
                  {record.discovered
                    ? "Bulundu"
                    : record.error
                      ? "Bulunamadı"
                      : "Henüz keşfedilmedi"}
                </dd>
                <dt>Sürüm doğrulaması</dt>
                <dd>
                  {record.verified ? "Yalnız sürüm doğrulandı" : "Doğrulanmadı"}
                </dd>
                <dt>Son doğrulama denemesi</dt>
                <dd>
                  {record.lastVerificationAt
                    ? new Date(record.lastVerificationAt).toLocaleString(
                        "tr-TR",
                      )
                    : "Yapılmadı"}
                </dd>
              </dl>
              {record.error && (
                <p className="drawer-note">{record.error.message}</p>
              )}
              {record.compatibilityEvidence.map((e) => (
                <p key={e.observedAt} className="drawer-note">
                  {e.source} · {e.platform} · {e.version}. Bu kanıt yalnız sürüm
                  çıktısına aittir.
                </p>
              ))}
            </section>
          )}
          {integration && record?.executable && (
            <section aria-labelledby="drawer-h-path">
              <h3 id="drawer-h-path">Yürütülebilir dosya</h3>
              <ExecutablePath path={record.executable.path} />
            </section>
          )}
          <section aria-labelledby="drawer-h-state">
            <h3 id="drawer-h-state">Çalışma durumu</h3>
            <dl className="drawer-facts">
              {!integration && (
                <>
                  <dt>Bağlı ajan</dt>
                  <dd>Yok</dd>
                </>
              )}
              {integration && (
                <>
                  <dt>Etkinlik</dt>
                  <dd>Etkin değil</dd>
                </>
              )}
              <dt>Aktif görev</dt>
              <dd>Yok — gerçek görev başlatılmaz</dd>
              <dt>Terminal oturumu</dt>
              <dd>Kapalı — ajan terminali yok</dd>
              <dt>Git değişiklikleri</dt>
              <dd>Bu aşamada toplanmaz</dd>
            </dl>
          </section>
          {integration && record && (
            <section aria-labelledby="drawer-h-caps">
              <h3 id="drawer-h-caps">Yetenekler ve izinler</h3>
              <button
                className="disclosure"
                aria-expanded={capsOpen}
                aria-controls={capsId}
                onClick={() => setCapsOpen((open) => !open)}
              >
                <span aria-hidden="true">{capsOpen ? "▾" : "▸"}</span>
                {capsOpen ? "Ayrıntıları gizle" : "Ayrıntıları göster"}
                <small>{capabilitySummary}</small>
              </button>
              <ul id={capsId} className="cap-list" hidden={!capsOpen}>
                {capabilityRows.map(([key, info]) => (
                  <li key={key} className={`cap-${info.state}`}>
                    <span>{capabilityLabel(key)}</span>
                    <b>
                      <span aria-hidden="true">{info.symbol}</span> {info.text}
                    </b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="drawer-h-next">
            <h3 id="drawer-h-next">Sonraki adım</h3>
            <div className="drawer-actions">
              <button className="secondary" onClick={onOpenAgents}>
                Ajanlar ekranını aç
              </button>
              <div className="unavailable">
                <button disabled aria-describedby="drawer-terminal-note">
                  Canlı ajan terminali
                </button>
                <p id="drawer-terminal-note">
                  <strong>Henüz kullanılamıyor.</strong> Keşif ve sürüm onayı
                  Ajanlar ekranındadır. Gerçek ajan terminali; süreç sahipliği,
                  izinler ve iptal doğrulanmadan açılmaz. Terminaller ekranı
                  yalnız güvenli yankı testidir.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
