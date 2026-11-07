import { useEffect, useId, useRef, useState } from "react";
import { shortenPath } from "./pathDisplay";

type CopyState = "idle" | "copied" | "failed";

/** execCommand needs no permission grant; it only works from a user gesture. */
function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.setAttribute("aria-hidden", "true");
  field.className = "path-offscreen";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Shortened executable path with the exact value one click away. Copying is
 * always user-triggered, purely local, and falls back to selectable text.
 */
export function ExecutablePath({ path }: { path: string }) {
  const [showFull, setShowFull] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");
  const field = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const fullId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (copy === "failed") {
      field.current?.focus();
      field.current?.select();
    }
  }, [copy, showFull]);
  async function copyPath() {
    window.clearTimeout(timer.current);
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(path);
      ok = true;
    } catch {
      ok = legacyCopy(path);
    }
    if (ok) {
      setCopy("copied");
      timer.current = window.setTimeout(() => setCopy("idle"), 4000);
    } else {
      setShowFull(true);
      setCopy("failed");
    }
  }
  return (
    <div className="exec-path">
      <code className="path-short" title={path}>
        {shortenPath(path)}
      </code>
      <div className="path-actions">
        <button
          className="secondary"
          aria-expanded={showFull}
          aria-controls={fullId}
          onClick={() => setShowFull((value) => !value)}
        >
          {showFull ? "Tam yolu gizle" : "Tam yolu göster"}
        </button>
        <button className="secondary" onClick={() => void copyPath()}>
          Yolu kopyala
        </button>
      </div>
      <textarea
        id={fullId}
        ref={field}
        className="path-full"
        readOnly
        rows={Math.min(5, Math.max(2, Math.ceil(path.length / 40)))}
        value={path}
        aria-label="Tam yürütülebilir dosya yolu"
        hidden={!showFull}
        onFocus={(event) => event.currentTarget.select()}
      />
      <p className="path-status" role="status">
        {copy === "copied" && "Yol panoya kopyalandı."}
        {copy === "failed" &&
          "Pano kullanılamadı. Yol seçildi; Ctrl+C ile kopyalayabilirsiniz."}
      </p>
    </div>
  );
}
