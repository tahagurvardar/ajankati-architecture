import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WorkerClient } from "../apps/desktop/main/worker-client";
const clients: WorkerClient[] = [];
const dirs: string[] = [];
const worker = resolve("apps/worker/dist/index.cjs");
function client(db: string) {
  const c = new WorkerClient(worker, db);
  clients.push(c);
  return c;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
describe("built Node worker over real child IPC and SQLite", () => {
  it("reports the blocked Codex pilot through sessions/v1 and cannot launch even with approval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ajankati-session-ipc-"));
    dirs.push(dir);
    const c = client(join(dir, "data.sqlite"));
    await c.ready;
    const snapshot = await c.request({ method: "snapshot", payload: {} });
    const state = await c.sessions({ method: "list", payload: {} });
    expect(state.capability.liveLaunch).toBe(false);
    expect(state.capability.blockers.length).toBeGreaterThan(0);
    expect(state.sessions).toEqual([]);
    await expect(
      c.sessions({
        method: "start",
        payload: { projectId: "p", approved: true },
      }),
    ).rejects.toThrow("kapalı");
    await expect(
      c.sessions({ method: "terminate", payload: { sessionId: "forged" } }),
    ).rejects.toThrow();
    expect(await c.request({ method: "snapshot", payload: {} })).toEqual(
      snapshot,
    );
  });
  it("exposes agents v1 without changing the mock snapshot and rejects forged paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ajankati-agents-ipc-"));
    dirs.push(dir);
    const c = client(join(dir, "data.sqlite"));
    await c.ready;
    const before = await c.request({ method: "snapshot", payload: {} });
    const rows = await c.agents({ method: "list", payload: {} });
    expect(rows.integrations).toHaveLength(2);
    expect(
      rows.integrations.every((row) => !row.enabled && !row.verified),
    ).toBe(true);
    await expect(
      c.agents({
        method: "discover",
        payload: { path: "C:\\evil.exe" },
      } as unknown as Parameters<WorkerClient["agents"]>[0]),
    ).rejects.toThrow();
    await expect(
      c.agents({
        method: "verify",
        payload: {
          integrationId: "codex-cli",
          approvalToken: "00000000-0000-4000-8000-000000000000",
          approved: true,
        },
      }),
    ).rejects.toThrow();
    expect(await c.request({ method: "snapshot", payload: {} })).toEqual(
      before,
    );
  });
  it.runIf(process.platform === "win32")(
    "owns ConPTY over versioned IPC and cleans up on desktop disconnect",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajankati-terminal-ipc-"));
      dirs.push(dir);
      const c = client(join(dir, "data.sqlite"));
      await c.ready;
      const session = await c.terminal({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      });
      await expect
        .poll(
          async () =>
            (
              await c.terminal({
                method: "read",
                payload: { sessionId: session.sessionId, cursor: 0 },
              })
            ).output,
          { timeout: 8000 },
        )
        .toContain("READY");
      expect((await c.request({ method: "snapshot", payload: {} })).mode).toBe(
        "mock",
      );
      await c.close();
      expect(() => process.kill(session.pid, 0)).toThrow();
    },
    15000,
  );
  it("persists the full mock → review → human acceptance flow across process restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ajankati-ipc-"));
    dirs.push(dir);
    const db = join(dir, "data.sqlite");
    const c = client(db);
    await c.ready;
    let state = await c.request({
      method: "project.create",
      payload: { name: "Türkçe proje" },
    });
    state = await c.request({
      method: "task.create",
      payload: {
        projectId: state.projects[0]!.id,
        title: "İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç",
      },
    });
    let t = state.tasks[0]!;
    state = await c.request({
      method: "task.ready",
      payload: { taskId: t.id, revision: t.revision },
    });
    t = state.tasks[0]!;
    state = await c.request({
      method: "task.run",
      payload: { taskId: t.id, revision: t.revision },
    });
    expect(state.tasks[0]!.status).toBe("running");
    for (let attempt = 0; attempt < 40; attempt++) {
      state = await c.request({ method: "snapshot", payload: {} });
      if (state.tasks[0]!.status === "awaiting_review") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    t = state.tasks[0]!;
    expect(t.status).toBe("awaiting_review");
    expect(t.result).toContain("gerçek ajan çalışmıyor");
    await expect(
      c.request({ method: "task.run", payload: { taskId: t.id, revision: 1 } }),
    ).rejects.toThrow();
    state = await c.request({
      method: "task.accept",
      payload: {
        taskId: t.id,
        revision: t.revision,
        resultHash: t.resultHash!,
      },
    });
    expect(state.tasks[0]!.status).toBe("succeeded");
    await c.close();
    const reopened = client(db);
    await reopened.ready;
    const persisted = await reopened.request({
      method: "snapshot",
      payload: {},
    });
    expect(persisted).toEqual(state);
    expect(persisted.events.some((e) => e.kind === "task.succeeded")).toBe(
      true,
    );
  });
  it("rejects a second writer and releases its lock on a normal shutdown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ajankati-lock-"));
    dirs.push(dir);
    const db = join(dir, "data.sqlite");
    const first = client(db);
    await first.ready;
    const second = client(db);
    await expect(second.ready).rejects.toThrow("başlatılamadı");
    await first.close();
    const next = client(db);
    await next.ready;
    expect((await next.request({ method: "snapshot", payload: {} })).mode).toBe(
      "mock",
    );
  });
});
