import { expect, it } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  rmSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  humanCliResponseSchema,
  agentResponseSchema,
} from "../packages/contracts/src";

it("serves only blocked human CLI preparation over the real worker IPC, without registering renderer workspaces", async () => {
  const dir = mkdtempSync(join(tmpdir(), "human-cli-ipc-"));
  const worker = fork(
    resolve("apps/worker/dist/index.cjs"),
    [join(dir, "data.sqlite")],
    {
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  try {
    await once(worker, "message", { signal: AbortSignal.timeout(8000) });
    async function request(command: unknown) {
      const message = once(worker, "message", {
        signal: AbortSignal.timeout(8000),
      });
      worker.send({
        protocol: "human-cli",
        version: 1,
        requestId: "r",
        command,
      });
      return humanCliResponseSchema.parse((await message)[0]);
    }
    expect(await request({ method: "list", payload: {} })).toMatchObject({
      ok: true,
      data: {
        mode: "human-controlled",
        liveLaunch: false,
        managedExecution: false,
        session: null,
      },
    });
    for (const integrationId of ["claude-code", "codex-cli"]) {
      expect(
        await request({
          method: "prepare",
          payload: { integrationId, workspaceId: "forged" },
        }),
      ).toMatchObject({ ok: false });
    }
    expect(
      await request({
        method: "start",
        payload: {
          sessionId: "00000000-0000-4000-8000-000000000000",
          approvalToken: "00000000-0000-4000-8000-000000000001",
          approved: true,
        },
      }),
    ).toMatchObject({ ok: false });
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, "exit", {
        signal: AbortSignal.timeout(10000),
      });
      if (worker.connected) worker.disconnect();
      else worker.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);

it.runIf(process.platform === "win32")(
  "prepares only synthetic CLI identities over real IPC, consumes once and cancels without execution",
  async () => {
    const dir = mkdtempSync(
      join(realpathSync.native(tmpdir()), "human-cli-offline-"),
    );
    mkdirSync(join(dir, "workspace"));
    // Not executable images: all interactions here must remain metadata-only.
    writeFileSync(join(dir, "claude.exe"), "offline synthetic identity");
    writeFileSync(join(dir, "codex.exe"), "offline synthetic identity");
    const env: NodeJS.ProcessEnv = { PATH: dir };
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
      if (process.env[key]) env[key] = process.env[key];
    const worker = fork(
      resolve("apps/worker/dist/index.cjs"),
      [join(dir, "data.sqlite")],
      { env, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] },
    );
    try {
      await once(worker, "message", { signal: AbortSignal.timeout(8000) });
      async function raw(protocol: string, command: unknown) {
        const response = once(worker, "message", {
          signal: AbortSignal.timeout(8000),
        });
        worker.send({ protocol, version: 1, requestId: "fixture", command });
        return (await response)[0];
      }
      const discovered = agentResponseSchema.parse(
        await raw("agents", { method: "discover", payload: {} }),
      );
      expect(discovered.ok).toBe(true);
      const registered = humanCliResponseSchema.parse(
        await raw("human-cli", {
          method: "register-workspace",
          payload: { path: join(dir, "workspace") },
        }),
      );
      if (!registered.ok) throw new Error("Registration failed");
      for (const integrationId of ["claude-code", "codex-cli"]) {
        const prepared = humanCliResponseSchema.parse(
          await raw("human-cli", {
            method: "prepare",
            payload: {
              integrationId,
              workspaceId: registered.data.workspaces[0]!.workspaceId,
            },
          }),
        );
        if (!prepared.ok || !prepared.data.session)
          throw new Error("Preparation failed");
        expect(prepared.data.session.executable.path).toBe(
          join(
            dir,
            integrationId === "claude-code" ? "claude.exe" : "codex.exe",
          ),
        );
        const start = {
          method: "start",
          payload: {
            sessionId: prepared.data.session.sessionId,
            approvalToken: prepared.data.session.approvalToken,
            approved: true,
          },
        };
        expect(
          humanCliResponseSchema.parse(await raw("human-cli", start)).ok,
        ).toBe(false);
        expect(
          humanCliResponseSchema.parse(await raw("human-cli", start)).ok,
        ).toBe(false);
        const state = humanCliResponseSchema.parse(
          await raw("human-cli", { method: "list", payload: {} }),
        );
        expect(state).toMatchObject({
          ok: true,
          data: {
            session: { status: "blocked", approvalToken: null },
            liveLaunch: false,
            managedExecution: false,
          },
        });
        expect(
          humanCliResponseSchema.parse(
            await raw("human-cli", {
              method: "stop",
              payload: {
                sessionId: prepared.data.session.sessionId,
                approved: true,
              },
            }),
          ),
        ).toMatchObject({ ok: true, data: { session: { status: "stopped" } } });
      }
    } finally {
      const exited = once(worker, "exit", {
        signal: AbortSignal.timeout(10000),
      });
      if (worker.connected) worker.disconnect();
      else worker.kill();
      await exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it.each([
  {
    protocol: "human-cli",
    version: 1,
    requestId: "bad",
    command: { method: "shell", payload: {} },
  },
  {
    protocol: "human-cli",
    version: 2,
    requestId: "bad",
    command: { method: "list", payload: {} },
  },
  {
    protocol: "human-cli",
    version: 1,
    requestId: "bad",
    command: {
      method: "prepare",
      payload: {
        integrationId: "claude-code",
        workspaceId: "x",
        path: "C:\\injected",
      },
    },
  },
  { protocol: "unknown", version: 1, requestId: "bad" },
  { protocol: "human-cli", padding: "x".repeat(270000) },
])("closes the worker on malformed or unknown IPC %#", async (message) => {
  const dir = mkdtempSync(join(tmpdir(), "human-cli-invalid-"));
  const worker = fork(
    resolve("apps/worker/dist/index.cjs"),
    [join(dir, "data.sqlite")],
    { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  try {
    await once(worker, "message", { signal: AbortSignal.timeout(8000) });
    const exited = once(worker, "exit", { signal: AbortSignal.timeout(10000) });
    worker.send(message);
    expect((await exited)[0]).toBe(0);
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, "exit");
      worker.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
