import { afterEach, expect, it } from "vitest";
import { TerminalHost } from "../apps/worker/src/terminal-host";
import {
  createDiagnosticJob,
  type DiagnosticJob,
} from "../apps/worker/src/job-owner";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const hosts: TerminalHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.stop();
});

it
  .runIf(process.platform === "win32")
  .each(["graceful", "forced", "timeout", "natural"])(
  "cleans a real nested diagnostic tree: %s",
  async (mode) => {
    let job!: DiagnosticJob;
    let lastActive = -1;
    const host = new TerminalHost(
      tmpdir(),
      () => {
        job = createDiagnosticJob();
        return { ...job, active: () => (lastActive = job.active()) };
      },
      mode === "timeout" ? 1500 : 300000,
    );
    hosts.push(host);
    const start = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    const sessionId = start.sessionId;
    const read = async () =>
      (
        await host.execute({
          method: "read",
          payload: { sessionId, cursor: 0 },
        })
      ).output;
    await expect.poll(read, { timeout: 8000 }).toContain("READY");
    await host.execute({
      method: "input",
      payload: { sessionId, data: ":tree\r" },
    });
    await expect.poll(read, { timeout: 8000 }).toMatch(/TREE:\d+:\d+/);
    const pids = /TREE:(\d+):(\d+)/
      .exec(await read())!
      .slice(1)
      .map(Number);
    for (const pid of pids) expect(() => process.kill(pid, 0)).not.toThrow();
    const members = job.members();
    expect(job.active()).toBeGreaterThanOrEqual(4);
    expect(members.map((member) => member.pid)).toEqual(
      expect.arrayContaining([start.pid, ...pids]),
    );
    if (mode === "forced" || mode === "timeout") {
      await host.execute({
        method: "input",
        payload: { sessionId, data: ":hold\r" },
      });
      await expect.poll(read).toContain("HOLDING");
    }
    if (mode === "natural")
      await host.execute({
        method: "input",
        payload: { sessionId, data: ":exit\r" },
      });
    if (mode === "timeout" || mode === "natural") {
      await expect
        .poll(
          async () =>
            (
              await host.execute({
                method: "read",
                payload: { sessionId, cursor: 0 },
              })
            ).status,
          { timeout: 8000 },
        )
        .toBe("exited");
    } else await host.execute({ method: "close", payload: { sessionId } });
    expect(lastActive).toBe(0);
    for (const { pid } of members) expect(() => process.kill(pid, 0)).toThrow();
    console.log(JSON.stringify({ mode, members, finalActive: lastActive }));
  },
  25000,
);

it.runIf(process.platform === "win32")(
  "fails closed when Job Object creation fails",
  async () => {
    const host = new TerminalHost(tmpdir(), () => {
      throw new Error("CreateJobObject failed");
    });
    hosts.push(host);
    await expect(
      host.execute({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      }),
    ).rejects.toThrow("CreateJobObject");
  },
);

it
  .runIf(process.platform === "win32")
  .each(["terminate", "accounting", "close"])(
  "poisons the host after %s failure; no unsafe restart",
  async (fault) => {
    let inject = false;
    let job!: DiagnosticJob;
    const host = new TerminalHost(tmpdir(), () => {
      job = createDiagnosticJob();
      return {
        ...job,
        terminate: () => {
          if (inject && fault === "terminate")
            throw new Error("injected cleanup failure");
          job.terminate();
        },
        active: () => {
          if (inject && fault === "accounting")
            throw new Error("injected cleanup failure");
          return job.active();
        },
        close: () => {
          if (inject && fault === "close")
            throw new Error("injected cleanup failure");
          job.close();
        },
      };
    });
    const start = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    await host.execute({
      method: "input",
      payload: { sessionId: start.sessionId, data: ":tree\r:hold\r" },
    });
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId: start.sessionId, cursor: 0 },
            })
          ).output,
        { timeout: 5000 },
      )
      .toMatch(/TREE:\d+:\d+/);
    const members = job.members();
    expect(members.length).toBeGreaterThanOrEqual(4);
    inject = true;
    try {
      await expect(
        host.execute({
          method: "close",
          payload: { sessionId: start.sessionId },
        }),
      ).rejects.toThrow("injected cleanup failure");
      await expect(
        host.execute({
          method: "start",
          payload: { profile: "safe-echo", cols: 80, rows: 24 },
        }),
      ).rejects.toThrow("sahiplik");
      await expect
        .poll(
          () => {
            try {
              process.kill(start.pid, 0);
              return false;
            } catch {
              return true;
            }
          },
          { timeout: 5000 },
        )
        .toBe(true);
      for (const member of members) {
        await expect
          .poll(
            () => {
              try {
                process.kill(member.pid, 0);
                return false;
              } catch {
                return true;
              }
            },
            { timeout: 5000 },
          )
          .toBe(true);
      }
    } finally {
      job.close();
      await host.stop().catch(() => {});
    }
  },
  15000,
);

it.runIf(process.platform === "win32")(
  "does not launch a new group when stop races a restart",
  async () => {
    let launches = 0;
    const host = new TerminalHost(tmpdir(), () => {
      launches++;
      return createDiagnosticJob();
    });
    hosts.push(host);
    const first = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    await host.execute({
      method: "close",
      payload: { sessionId: first.sessionId },
    });
    const restart = host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    const stopped = host.stop();
    await expect(restart).rejects.toThrow("kapatılıyor");
    await stopped;
    expect(launches).toBe(1);
  },
  15000,
);

it.runIf(process.platform === "win32")(
  "rejects a concurrent start and stale sessions through rapid restarts",
  async () => {
    const host = new TerminalHost();
    hosts.push(host);
    let previous = "00000000-0000-4000-8000-000000000000";
    for (let i = 0; i < 3; i++) {
      const pending = host.execute({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      });
      await expect(
        host.execute({
          method: "start",
          payload: { profile: "safe-echo", cols: 80, rows: 24 },
        }),
      ).rejects.toThrow();
      const start = await pending;
      await expect(
        host.execute({
          method: "input",
          payload: { sessionId: previous, data: "x" },
        }),
      ).rejects.toThrow();
      await host.execute({
        method: "close",
        payload: { sessionId: start.sessionId },
      });
      expect(() => process.kill(start.pid, 0)).toThrow();
      previous = start.sessionId;
    }
  },
  30000,
);

it.runIf(process.platform === "win32").each([0, 1])(
  "rejects real Windows association/launch denial with process limit %s",
  async (limit) => {
    const native = createRequire(import.meta.url)(
      resolve("apps/worker/native/build/Release/job_owner_test.node"),
    ) as {
      create(name: string, limit: number): object;
      active(handle: object): number;
      terminate(handle: object): void;
      close(handle: object): void;
      members(handle: object): { pid: number; image: string }[];
    };
    let job!: DiagnosticJob;
    let finalActive = -1;
    const host = new TerminalHost(tmpdir(), () => {
      const name = `Local\\AjanKati-${randomUUID()}`;
      const handle = native.create(name, limit);
      job = {
        name,
        active: () => (finalActive = native.active(handle)),
        terminate: () => native.terminate(handle),
        close: () => native.close(handle),
        members: () => native.members(handle),
      };
      return job;
    });
    hosts.push(host);
    await expect(
      host.execute({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      }),
    ).rejects.toThrow("launch failed");
    expect(finalActive).toBe(0);
  },
  15000,
);

it.runIf(process.platform === "win32")(
  "rejects native job name collision without taking ownership of another job",
  () => {
    const native = createRequire(import.meta.url)(
      resolve("apps/worker/dist/job_owner.node"),
    ) as {
      create(name: string): object;
      close(handle: object): void;
    };
    const name = `Local\\AjanKati-${randomUUID()}`;
    const owned = native.create(name);
    try {
      expect(() => native.create(name)).toThrow("already exists");
    } finally {
      native.close(owned);
    }
    expect(() => native.create("invalid\\job\\name")).toThrow(
      "CreateJobObject failed",
    );
  },
);
