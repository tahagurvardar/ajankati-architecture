import { useEffect, useState } from "react";
import type { AgentApi, AgentState, AgentRecord } from "@ajankati/contracts";

const labels: Record<keyof AgentRecord["capabilities"], string> = {
  versionCheck: "Sürüm kontrolü",
  pty: "Gerçek ajan terminali",
  processOwnership: "Süreç ağacı sahipliği",
  permissions: "İzin denetimi",
  cancellation: "İptal",
  sandbox: "Sandbox",
  structuredEvents: "Yapılandırılmış olaylar",
  managedTasks: "Yönetilen görevler",
};
const status = {
  verified: "Doğrulandı",
  unknown: "Bilinmiyor",
  unsupported: "Bu aşamada desteklenmiyor",
};
export function AgentsPanel({ api }: { api: AgentApi }) {
  const [state, setState] = useState<AgentState>({ integrations: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api
      .list()
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {
        if (live) setError("Ajan kayıtları alınamadı.");
      });
    return () => {
      live = false;
    };
  }, [api]);
  async function apply(action: () => Promise<AgentState>) {
    setBusy(true);
    setError("");
    try {
      setState(await action());
    } catch {
      setError(
        "İşlem reddedildi veya işçi bağlantısı kesildi. Yeniden keşfedin.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="agents-panel" aria-labelledby="agents-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">YEREL CLI ENVANTERİ</p>
          <h2 id="agents-title">Ajanlar</h2>
        </div>
        <button
          disabled={busy}
          onClick={() => void apply(() => api.discover())}
        >
          CLI’leri keşfet
        </button>
      </div>
      <p>
        Keşif süreç başlatmaz. Sürüm kontrolü yalnız gösterilen dosyayı{" "}
        <code>--version</code> ile çalıştırır. 4 saniyede yanıt gelmezse
        doğrudan çocuk için sonlandırma istenir; süreç ağacı temizliği
        doğrulanmış değildir. Her kontrol için açık onay gerekir.
      </p>
      <p>
        Kimlik doğrulama dosyaları incelenmez. Bulunmuş veya sürümü doğrulanmış
        olmak bağlı / etkin olmak değildir. Gerçek görev ve oturum başlatma
        kapalıdır.
      </p>
      {busy && <p role="status">Kontrol sürüyor…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="agent-grid">
        {state.integrations.map((row) => (
          <article className="agent-card" key={row.integrationId}>
            <h3>{row.provider}</h3>
            <p className="status">
              {row.discovered
                ? "Bulundu"
                : row.error
                  ? "Bulunamadı"
                  : "Henüz keşfedilmedi"}{" "}
              · {row.verified ? "Yalnız sürüm doğrulandı" : "Doğrulanmadı"} ·
              Etkin değil
            </p>
            <dl>
              <dt>Sürüm</dt>
              <dd>{row.detectedVersion ?? "Bilinmiyor"}</dd>
              <dt>Son doğrulama denemesi</dt>
              <dd>
                {row.lastVerificationAt
                  ? new Date(row.lastVerificationAt).toLocaleString("tr-TR")
                  : "Yapılmadı"}
              </dd>
            </dl>
            {row.executable && (
              <>
                <p className="agent-path">{row.executable.path}</p>
                <small>
                  {row.executable.kind === "npm-native"
                    ? "npm .cmd → doğrudan native .exe; shell açılmaz"
                    : row.executable.kind}
                </small>
              </>
            )}
            {row.error && <p role="status">{row.error.message}</p>}
            {row.approvalToken && (
              <button
                disabled={busy}
                onClick={() =>
                  void apply(() =>
                    api.verify(row.integrationId, row.approvalToken!),
                  )
                }
              >
                {row.provider}: --version çalıştırmayı onayla
              </button>
            )}
            <details>
              <summary>Yetenekler ve uyumluluk kanıtı</summary>
              <dl>
                {Object.entries(row.capabilities).map(([key, value]) => (
                  <div key={key}>
                    <dt>{labels[key as keyof typeof labels]}</dt>
                    <dd>{status[value]}</dd>
                  </div>
                ))}
              </dl>
              {row.compatibilityEvidence.map((e) => (
                <p key={e.observedAt}>
                  {e.source} · {e.platform} · {e.version}. Bu kanıt yalnız sürüm
                  çıktısına aittir.
                </p>
              ))}
            </details>
          </article>
        ))}
      </div>
      <p>
        Süreç sahipliği, izinler ve iptal doğrulanmadan güvenli yönetim açılmaz.
        Kayıtlar bu uygulama oturumu içindir; yeniden keşif eski onayı ve kanıtı
        sıfırlar.
      </p>
    </section>
  );
}
