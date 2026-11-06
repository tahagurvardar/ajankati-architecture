import { useEffect, useRef, type KeyboardEvent } from "react";
import type { AgentRecord } from "@ajankati/contracts";
import {
  capabilityLabels,
  capabilityStatus,
  describeInventory,
  type InventoryState,
  type OfficeRole,
} from "./agentView";

const focusable = "button:not(:disabled), a[href]";

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
  useEffect(() => {
    close.current?.focus();
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
          <h3>GERÇEK DURUM</h3>
          <dl className="drawer-facts">
            {integration && record && (
              <>
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
                <dt>Etkinlik</dt>
                <dd>Etkin değil</dd>
                <dt>Son doğrulama denemesi</dt>
                <dd>
                  {record.lastVerificationAt
                    ? new Date(record.lastVerificationAt).toLocaleString(
                        "tr-TR",
                      )
                    : "Yapılmadı"}
                </dd>
              </>
            )}
            {!integration && (
              <>
                <dt>Bağlı ajan</dt>
                <dd>Yok</dd>
              </>
            )}
            <dt>Aktif görev</dt>
            <dd>Yok — gerçek görev başlatılmaz</dd>
            <dt>Terminal oturumu</dt>
            <dd>Kapalı — ajan terminali yok</dd>
            <dt>Git değişiklikleri</dt>
            <dd>Bu aşamada toplanmaz</dd>
          </dl>
          {integration && record && (
            <>
              {record.executable && (
                <p className="agent-path">{record.executable.path}</p>
              )}
              {record.error && <p>{record.error.message}</p>}
              <h3>YETENEKLER VE İZİNLER</h3>
              <dl className="drawer-facts">
                {Object.entries(record.capabilities).map(([key, value]) => (
                  <div key={key} className="fact-row">
                    <dt>
                      {capabilityLabels[key as keyof typeof capabilityLabels]}
                    </dt>
                    <dd>{capabilityStatus[value]}</dd>
                  </div>
                ))}
              </dl>
              {record.compatibilityEvidence.map((e) => (
                <p key={e.observedAt}>
                  {e.source} · {e.platform} · {e.version}. Bu kanıt yalnız sürüm
                  çıktısına aittir.
                </p>
              ))}
            </>
          )}
          <h3>SONRAKİ ADIM</h3>
          <div className="drawer-actions">
            <button className="secondary" onClick={onOpenAgents}>
              Ajanlar ekranını aç
            </button>
            <button disabled aria-describedby="drawer-terminal-note">
              Canlı ajan terminali — henüz kullanılamıyor
            </button>
          </div>
          <p id="drawer-terminal-note" className="drawer-note">
            Keşif ve sürüm onayı Ajanlar ekranındadır. Gerçek ajan terminali;
            süreç sahipliği, izinler ve iptal doğrulanmadan açılmaz. Terminaller
            ekranı yalnız güvenli yankı testidir.
          </p>
        </div>
      </div>
    </>
  );
}
