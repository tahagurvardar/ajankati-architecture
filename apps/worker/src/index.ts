import { mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "@ajankati/storage";
import { MockAgent } from "@ajankati/adapters";
import { WorkerService } from "./service";
import {
  terminalRequestSchema,
  type TerminalResponse,
} from "@ajankati/contracts";
import { TerminalHost } from "./terminal-host";

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
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await terminal.stop();
      await service.stop();
      store?.close();
      closeSync(fd);
      unlinkSync(lock);
      process.exit(0);
    };
    process.on("message", (message: unknown) => {
      if (stopping) return;
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
