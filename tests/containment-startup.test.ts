import { it, expect } from "vitest";
import { fork } from "node:child_process";
import { resolve } from "node:path";

it
  .runIf(process.platform === "win32")
  .each([
    "before-open",
    "after-open",
    "after-association",
    "suspended",
    "before-resume",
  ])(
  "cleans owned processes after owner crash at native checkpoint %s",
  async (stage) => {
    const owner = fork(
      resolve("tests/fixtures/containment-owner.cjs"),
      [stage],
      { execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    try {
      const observed = await new Promise<{
        pid: number;
        members: { pid: number; image: string }[];
        ready: boolean;
      }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("native checkpoint timeout")),
          10000,
        );
        owner.once("message", (value) => {
          clearTimeout(timer);
          resolve(value as never);
        });
        owner.once("error", reject);
      });
      expect(observed.ready).toBe(false);
      if (["suspended", "before-resume"].includes(stage))
        expect(observed.members.length).toBeGreaterThanOrEqual(2);
      const exited = new Promise<void>((resolve) =>
        owner.once("exit", () => resolve()),
      );
      owner.kill();
      await exited;
      for (const pid of new Set([
        observed.pid,
        ...observed.members.map((member) => member.pid),
      ])) {
        await expect
          .poll(
            () => {
              try {
                process.kill(pid, 0);
                return false;
              } catch {
                return true;
              }
            },
            { timeout: 8000 },
          )
          .toBe(true);
      }
      console.log(JSON.stringify({ stage, ...observed, cleaned: true }));
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill();
    }
  },
  20000,
);
