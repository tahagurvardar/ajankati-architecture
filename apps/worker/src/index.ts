import { mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "@ajankati/storage";
import { MockAgent } from "@ajankati/adapters";
import { WorkerService } from "./service";
import {
  terminalRequestSchema,
  agentRequestSchema,
  sessionRequestSchema,
  humanCliRequestSchema,
  humanCliResponseSchema,
  MAX_FRAME_BYTES,
  type TerminalResponse,
} from "@ajankati/contracts";
import { TerminalHost } from "./terminal-host";
import { AgentRegistry } from "./agent-registry";
import { SessionHost } from "./session-host";
import { HumanCliHost, diagnosticOf } from "./human-cli-host";
import { runShutdown } from "./shutdown";

async function main(): Promise<void> {
  const filename = process.argv[2];
  if (!filename || !process.send)
    throw new Error("İşçiyi masaüstü veya demo başlatıcısı üzerinden açın.");
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  // Deliberately fail closed on a stale lock; never steal ownership from another worker.
  const lock = filename + ".lock";
  const fd = openSync(lock, "wx", 0o600);
  let store: Store | undefined;
  try {
    store = new Store(filename);
    store.recover();
    const service = new WorkerService(store, new MockAgent());
    const terminal = new TerminalHost(dirname(filename));
    const agents = new AgentRegistry();
    // Registrations originate only from the owning main process's native picker.
    const humanCli = new HumanCliHost(agents);
    const sessions = new SessionHost(store);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      // Every step runs even if an earlier one throws or hangs; the lock is always
      // released so a failed cleanup cannot wedge the next start. Exiting also closes
      // the job-owned process trees. A cleanup failure is reported by exit code only.
      const { failed } = await runShutdown(
        [
          { name: "human-cli", run: () => humanCli.stop() },
          { name: "agents", run: () => agents.stop() },
          { name: "terminal", run: () => terminal.stop() },
          { name: "service", run: () => service.stop() },
          { name: "store", run: () => store?.close() },
          { name: "lock-fd", run: () => closeSync(fd) },
          { name: "lock-file", run: () => unlinkSync(lock) },
        ],
        3000,
      );
      process.exit(failed.length === 0 ? 0 : 1);
    };
    process.on("message", (message: unknown) => {
      if (stopping) return;
      if (Buffer.byteLength(JSON.stringify(message)) > MAX_FRAME_BYTES) {
        void stop();
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "protocol" in message &&
        message.protocol === "human-cli"
      ) {
        const parsed = humanCliRequestSchema.safeParse(message);
        if (!parsed.success) {
          void stop();
          return;
        }
        const envelope = {
          protocol: "human-cli",
          version: 1,
          requestId: parsed.data.requestId,
        };
        void humanCli
          .execute(parsed.data.command)
          .then((data) => {
            const response = humanCliResponseSchema.parse({
              ...envelope,
              ok: true,
              data,
            });
            if (Buffer.byteLength(JSON.stringify(response)) > MAX_FRAME_BYTES) {
              void stop();
              return;
            }
            if (!stopping && process.connected) process.send?.(response);
          })
          .catch((error: unknown) => {
            const code = diagnosticOf(error);
            if (!stopping && process.connected)
              process.send?.({
                ...envelope,
                ok: false,
                error:
                  "İnsan kontrollü CLI isteği reddedildi; gerçek başlatma kapalı." +
                  (code ? ` [${code}]` : ""),
              });
          });
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "protocol" in message &&
        message.protocol === "sessions"
      ) {
        const parsed = sessionRequestSchema.safeParse(message);
        if (!parsed.success) {
          void stop();
          return;
        }
        const envelope = {
          protocol: "sessions",
          version: 1,
          requestId: parsed.data.requestId,
        };
        try {
          const data = sessions.execute(parsed.data.command);
          if (process.connected)
            process.send?.({ ...envelope, ok: true, data });
        } catch {
          if (process.connected)
            process.send?.({
              ...envelope,
              ok: false,
              error:
                "Canlı Codex pilotu kapalı; güvenlik ve uyumluluk kapıları tamamlanmadı.",
            });
        }
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "protocol" in message &&
        message.protocol === "agents"
      ) {
        const parsed = agentRequestSchema.safeParse(message);
        if (!parsed.success) {
          void stop();
          return;
        }
        const envelope = {
          protocol: "agents",
          version: 1,
          requestId: parsed.data.requestId,
        };
        void agents
          .execute(parsed.data.command)
          .then((data) => {
            if (process.connected)
              process.send?.({ ...envelope, ok: true, data });
          })
          .catch(() => {
            if (process.connected)
              process.send?.({
                ...envelope,
                ok: false,
                error:
                  "Keşif isteği reddedildi; onayı ve çalışan kontrolü inceleyin.",
              });
          });
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "protocol" in message
      ) {
        const parsed = terminalRequestSchema.safeParse(message);
        if (!parsed.success) {
          void stop();
          return;
        }
        const { requestId, command } = parsed.data;
        const send = (response: TerminalResponse) => {
          if (process.connected) process.send?.(response);
        };
        void terminal
          .execute(command)
          .then((data) =>
            send({
              protocol: "terminal",
              version: 1,
              requestId,
              ok: true,
              data,
            }),
          )
          .catch(() =>
            send({
              protocol: "terminal",
              version: 1,
              requestId,
              ok: false,
              error: "Terminal işlemi reddedildi veya ConPTY kullanılamıyor.",
            }),
          );
        return;
      }
      void service
        .handle(message)
        .then((response) => {
          if (process.connected) process.send?.(response);
        })
        .catch(() => {
          void stop();
        });
    });
    process.on("disconnect", () => {
      void stop();
    });
    process.on("SIGTERM", () => {
      void stop();
    });
    process.on("SIGINT", () => {
      void stop();
    });
    process.send({ type: "worker.ready", version: 1 });
  } catch (error) {
    store?.close();
    closeSync(fd);
    unlinkSync(lock);
    throw error;
  }
}
void main().catch(() => {
  console.error(
    "İşçi açılamadı. Veri yolu, kilit ve SQLite sürümünü kontrol edin.",
  );
  process.exitCode = 1;
});
