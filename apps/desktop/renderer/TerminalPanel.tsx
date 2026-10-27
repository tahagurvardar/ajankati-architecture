import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TerminalApi } from "@ajankati/contracts";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel({ api }: { api: TerminalApi }) {
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const current = useRef<string | null>(null);
  const [status, setStatus] = useState("Kapalı");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cursor = useRef(0);

  useEffect(() => {
    const term = new Terminal({
      scrollback: 5000,
      fontSize: 14,
      convertEol: false,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // xterm 6 creates all style nodes synchronously in open(), including its
    // viewport (which ignores documentOverride). Scope the nonce to that call;
    // never grant arbitrary DOM styles an exemption or weaken script-src.
    const createElement = document.createElement;
    document.createElement = new Proxy(createElement, {
      apply(target, receiver, args) {
        const element = Reflect.apply(target, receiver, args) as HTMLElement;
        if (args[0] === "style") element.setAttribute("nonce", api.styleNonce);
        return element;
      },
    });
    try {
      term.open(container.current!);
    } finally {
      document.createElement = createElement;
    }
    terminal.current = term;
    let live = true;
    let polling = false;
    let writing = false;
    let queuedInput = "";
    let inputSession: string | null = null;
    let resizing = false;
    const fail = () => {
      if (live)
        setError(
          "Terminal işlemi tamamlanamadı. Oturumu kapatıp yeniden açın.",
        );
    };
    const flushInput = async () => {
      if (writing) return;
      writing = true;
      try {
        while (live && queuedInput && current.current === inputSession) {
          let length = Math.min(4096, queuedInput.length);
          if (/[\uD800-\uDBFF]/.test(queuedInput[length - 1])) length--;
          if (!length) break;
          const data = queuedInput.slice(0, length);
          queuedInput = queuedInput.slice(length);
          await api.input(inputSession!, data);
        }
      } catch {
        queuedInput = "";
        fail();
      } finally {
        writing = false;
      }
    };
    const input = term.onData((data) => {
      const id = current.current;
      if (!id) return;
      if (inputSession !== id) {
        queuedInput = "";
        inputSession = id;
      }
      if (queuedInput.length + data.length > 8192) {
        setError("Giriş sınırı aşıldı; metin gönderilmedi.");
        return;
      }
      queuedInput += data;
      void flushInput();
    });
    const resize = () => {
      fit.fit();
      const id = current.current;
      if (id && !resizing) {
        resizing = true;
        void api
          .resize(
            id,
            Math.max(20, Math.min(300, term.cols)),
            Math.max(5, Math.min(100, term.rows)),
          )
          .catch(fail)
          .finally(() => {
            resizing = false;
          });
      }
    };
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    observer.observe(container.current!);
    const timer = setInterval(() => {
      const id = current.current;
      if (!id || polling) return;
      polling = true;
      void api
        .read(id, cursor.current)
        .then(async (state) => {
          if (!live || current.current !== id) return;
          cursor.current = state.cursor;
          if (state.dropped) {
            term.reset();
            setError(`Çıktı sınırı aşıldı: ${state.dropped} karakter atlandı.`);
          }
          await new Promise<void>((resolve) =>
            term.write(state.output, resolve),
          );
          if (state.status === "exited" && state.output.length === 0 && live) {
            current.current = null;
            setActive(false);
            setStatus(`Sonlandı · çıkış ${state.exitCode}`);
          }
        })
        .catch(() => {
          fail();
          current.current = null;
          if (live) {
            setActive(false);
            setStatus("Bağlantı kesildi");
          }
        })
        .finally(() => {
          polling = false;
        });
    }, 50);
    return () => {
      live = false;
      clearInterval(timer);
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      input.dispose();
      const id = current.current;
      current.current = null;
      if (id) void api.close(id).catch(() => {});
      term.dispose();
      terminal.current = null;
    };
  }, [api]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const term = terminal.current!;
      const state = await api.start(
        Math.max(20, Math.min(300, term.cols)),
        Math.max(5, Math.min(100, term.rows)),
      );
      term.reset();
      cursor.current = 0;
      current.current = state.sessionId;
      setActive(true);
      setStatus("Çalışıyor · güvenli yankı testi");
      term.focus();
    } catch {
      setError(
        "ConPTY açılamadı. Bu profil Windows gerektirir; native modül kurulumunu kontrol edin.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function control(action: "interrupt" | "close") {
    const id = current.current;
    if (!id) return;
    setBusy(true);
    try {
      await api[action](id);
    } catch {
      setError("Terminal kontrolü başarısız.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="workspace terminal-panel"
      aria-label="Windows test terminali"
    >
      <h2>Windows ConPTY terminali</h2>
      <p>
        Yalnız yankı testi. Yazdıklarınız komut olarak çalıştırılmaz. :size
        boyutu gösterir, :exit kapatır. Oturum en fazla 5 dakika sürer.
      </p>
      <div className="actions">
        <button disabled={active || busy} onClick={() => void start()}>
          Test terminalini aç
        </button>
        <button
          disabled={!active || busy}
          onClick={() => void control("interrupt")}
        >
          Ctrl+C
        </button>
        <button
          disabled={!active || busy}
          onClick={() => void control("close")}
        >
          Terminali kapat
        </button>
        <span role="status">{status}</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div ref={container} className="terminal-surface" />
    </section>
  );
}
