import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalHost } from "../apps/worker/src/terminal-host";
import {
  createDiagnosticJob,
  type DiagnosticJob,
} from "../apps/worker/src/job-owner";

const start = {
  method: "start",
  payload: { profile: "safe-echo", cols: 80, rows: 24 },
} as const;
it.runIf(process.platform === "win32")(
  "recovers after pre-launch directory failure without leaving the starting latch set",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-recovery-"));
    const missing = join(root, "missing");
    const host = new TerminalHost(missing);
    try {
      await expect(host.execute(start)).rejects.toThrow("ENOENT");
      mkdirSync(missing);
      const session = await host.execute(start);
      expect(session.status).toBe("running");
      await host.execute({
        method: "close",
        payload: { sessionId: session.sessionId },
      });
      expect(() => process.kill(session.pid, 0)).toThrow();
    } finally {
      await host.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
  20000,
);

it.runIf(process.platform === "win32")(
  "cancels an in-flight ConPTY startup and verifies zero owned processes before shutdown returns",
  async () => {
    let job!: DiagnosticJob;
    let finalActive = -1;
    const host = new TerminalHost(tmpdir(), () => {
      job = createDiagnosticJob();
      return { ...job, active: () => (finalActive = job.active()) };
    });
    const pending = host.execute(start);
    const rejection = expect(pending).rejects.toThrow();
    await host.stop();
    await rejection;
    expect(finalActive).toBe(0);
    await expect(host.execute(start)).rejects.toThrow();
  },
  20000,
);
