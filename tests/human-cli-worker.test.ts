import { expect, it } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { humanCliResponseSchema } from "../packages/contracts/src";

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
