import { expect, it } from "vitest";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { terminalResponseSchema } from "../packages/contracts/src/index";

it.runIf(process.platform === "win32").each([false, true])(
  "leaves no diagnostic process after forced worker death (ready=%s)",
  async (warm) => {
    const dir = mkdtempSync(join(tmpdir(), "ajankati-crash-"));
    const child = fork(
      resolve("apps/worker/dist/index.cjs"),
      [join(dir, "data.sqlite")],
      { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    let pid: number | undefined;
    let sessionId = "";
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("worker readiness timeout")),
          8000,
        );
        child.once("message", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("error", reject);
      });
      const session = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("terminal start timeout")),
          8000,
        );
        child.once("message", (input) => {
          clearTimeout(timer);
          const response = terminalResponseSchema.parse(input);
          if (response.ok) {
            sessionId = response.data.sessionId;
            resolve(response.data.pid);
          } else reject(new Error(response.error));
        });
      });
      child.send({
        protocol: "terminal",
        version: 1,
        requestId: "crash",
        command: {
          method: "start",
          payload: { profile: "safe-echo", cols: 80, rows: 24 },
        },
      });
      pid = await session;
      if (warm) {
        await expect
          .poll(
            async () => {
              const output = new Promise<string>((resolve, reject) => {
                const timer = setTimeout(
                  () => reject(new Error("read timeout")),
                  5000,
                );
                child.once("message", (input) => {
                  clearTimeout(timer);
                  const response = terminalResponseSchema.parse(input);
                  if (response.ok) resolve(response.data.output);
                  else reject(new Error(response.error));
                });
              });
              child.send({
                protocol: "terminal",
                version: 1,
                requestId: "read",
                command: { method: "read", payload: { sessionId, cursor: 0 } },
              });
              return output;
            },
            { timeout: 8000 },
          )
          .toContain("READY");
      }
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill();
      await exited;
      await expect
        .poll(
          () => {
            try {
              process.kill(pid!, 0);
              return false;
            } catch {
              return true;
            }
          },
          { timeout: 8000 },
        )
        .toBe(true);
      pid = undefined; // Never send another signal after the owned process is known gone.
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      if (pid) {
        try {
          process.kill(pid);
        } catch {
          /* already exited */
        }
      }
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
  20000,
);
