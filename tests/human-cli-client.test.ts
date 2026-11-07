import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WorkerClient } from "../apps/desktop/main/worker-client";

const clients: WorkerClient[] = [];
const dirs: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it.each([
  "disconnect",
  "wrong-protocol",
  "malformed",
  "oversize",
  "timeout",
  "duplicate-ready",
])("fails closed after %s without reconnect or replay", async (mode) => {
  const client = new WorkerClient(
    resolve("tests/fixtures/human-cli-worker-peer.cjs"),
    mode,
  );
  clients.push(client);
  await client.ready;
  if (mode === "timeout") vi.useFakeTimers();
  const result = expect(
    client.humanCli({ method: "list", payload: {} }),
  ).rejects.toThrow();
  if (mode === "timeout") await vi.advanceTimersByTimeAsync(10001);
  await result;
  await expect(
    client.humanCli({ method: "list", payload: {} }),
  ).rejects.toThrow();
});

it("rejects responses before the ready handshake", async () => {
  const client = new WorkerClient(
    resolve("tests/fixtures/human-cli-worker-peer.cjs"),
    "before-ready",
  );
  clients.push(client);
  await expect(client.ready).rejects.toThrow();
});

it.runIf(process.platform === "win32")(
  "registers through the real worker client and loses authority on owner close",
  async () => {
    const dir = mkdtempSync(
      join(realpathSync.native(tmpdir()), "human-client-"),
    );
    dirs.push(dir);
    const db = join(dir, "state.sqlite");
    const client = new WorkerClient(resolve("apps/worker/dist/index.cjs"), db);
    clients.push(client);
    const state = await client.humanCli({
      method: "register-workspace",
      payload: { path: dir },
    });
    expect(state.workspaces).toEqual([
      { workspaceId: expect.any(String), path: dir },
    ]);
    await client.close();
    await expect(
      client.humanCli({ method: "list", payload: {} }),
    ).rejects.toThrow();
    const next = new WorkerClient(resolve("apps/worker/dist/index.cjs"), db);
    clients.push(next);
    expect(await next.humanCli({ method: "list", payload: {} })).toMatchObject({
      session: null,
      workspaces: [],
      liveLaunch: false,
      managedExecution: false,
    });
    await expect(
      next.humanCli({
        method: "prepare",
        payload: {
          integrationId: "claude-code",
          workspaceId: state.workspaces[0]!.workspaceId,
        },
      }),
    ).rejects.toThrow();
  },
);
