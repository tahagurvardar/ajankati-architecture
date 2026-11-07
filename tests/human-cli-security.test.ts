import { afterEach, expect, it, vi } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import {
  HumanCliHost,
  diagnosticOf,
  type HumanCliHostOptions,
} from "../apps/worker/src/human-cli-host";
import { humanCliResponseSchema } from "../packages/contracts/src";

const dirs: string[] = [];
const hosts: HumanCliHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) void host.stop();
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
// Synthetic, never-executed images; the canonical temp root avoids hosted-CI aliases.
async function fixture(
  options?: HumanCliHostOptions,
  probe?: ConstructorParameters<typeof AgentRegistry>[0] extends infer O
    ? O extends { probe?: infer P }
      ? P
      : never
    : never,
) {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), "hardening-"));
  dirs.push(dir);
  const workspace = join(dir, "workspace");
  mkdirSync(workspace);
  writeFileSync(join(dir, "claude.exe"), "AAAAAAAA");
  writeFileSync(join(dir, "codex.exe"), "offline-codex");
  const registry = new AgentRegistry({
    directories: [dir],
    platform: "win32",
    probe,
  });
  await registry.execute({ method: "discover", payload: {} });
  const host = new HumanCliHost(registry, options);
  hosts.push(host);
  const registered = await host.execute({
    method: "register-workspace",
    payload: { path: workspace },
  });
  const prepare = {
    method: "prepare",
    payload: {
      integrationId: "claude-code",
      workspaceId: registered.workspaces[0]!.workspaceId,
    },
  };
  return { dir, workspace, registry, host, prepare };
}
function start(state: Awaited<ReturnType<HumanCliHost["execute"]>>) {
  return {
    method: "start",
    payload: {
      sessionId: state.session!.sessionId,
      approvalToken: state.session!.approvalToken,
      approved: true,
    },
  };
}
const win = it.runIf(process.platform === "win32");

win(
  "rejects workspaces that contain the user profile or its credential directories",
  async () => {
    const { host } = await fixture();
    for (const path of [homedir(), dirname(homedir())])
      await expect(
        host.execute({ method: "register-workspace", payload: { path } }),
      ).rejects.toThrow("WORKSPACE_TOO_BROAD");
    expect(
      (await host.execute({ method: "list", payload: {} })).workspaces,
    ).toHaveLength(1);
  },
);

win(
  "detects an executable rewritten in place with preserved size and mtime",
  async () => {
    const { host, dir, prepare } = await fixture();
    const image = join(dir, "claude.exe");
    const { atime, mtime } = statSync(image);
    const state = await host.execute(prepare);
    writeFileSync(image, "BBBBBBBB");
    utimesSync(image, atime, mtime);
    await expect(host.execute(start(state))).rejects.toThrow(
      "IDENTITY_CHANGED",
    );
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
  },
);

win(
  "treats a content digest change as replacement even when every metadata field matches",
  async () => {
    let calls = 0;
    const { host, prepare } = await fixture({
      digest: async () => (++calls > 1 ? "b" : "a").repeat(64),
    });
    const state = await host.execute(prepare);
    await expect(host.execute(start(state))).rejects.toThrow(
      "IDENTITY_CHANGED",
    );
    expect(
      (await host.execute({ method: "list", payload: {} })).session,
    ).toMatchObject({ status: "blocked", approvalToken: null });
  },
);

win("fails closed when the executable image cannot be digested", async () => {
  const { host, prepare } = await fixture({
    digest: async () => {
      throw new Error("EBUSY");
    },
  });
  await expect(host.execute(prepare)).rejects.toThrow();
  expect(
    (await host.execute({ method: "list", payload: {} })).session,
  ).toBeNull();
});

win(
  "invalidates consent when provider startup config appears after preparation",
  async () => {
    const { host, workspace, prepare } = await fixture();
    const state = await host.execute(prepare);
    mkdirSync(join(workspace, ".claude"));
    await expect(host.execute(start(state))).rejects.toThrow(
      "IDENTITY_CHANGED",
    );
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
  },
);

win(
  "aborts an in-flight image digest on owner shutdown without creating a session",
  async () => {
    const { host, prepare } = await fixture({
      digest: (_path, signal) =>
        new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () =>
            reject(new Error("DIGEST_ABORTED")),
          ),
        ),
    });
    const pending = host.execute(prepare);
    await vi.waitFor(async () => {
      await expect(host.execute(prepare)).rejects.toThrow("BUSY");
    });
    await host.stop();
    await expect(pending).rejects.toThrow();
    await expect(host.execute(prepare)).rejects.toThrow("OWNER_STOPPED");
  },
);

win(
  "explains the refusal with a blocker count and keeps launch disabled even for the pinned version",
  async () => {
    const { host, registry, workspace, prepare } = await fixture(
      undefined,
      async () => ({
        output: "2.1.296 (Claude Code)",
        error: null,
      }),
    );
    const unverified = await host.execute(prepare);
    const failure = await host.execute(start(unverified)).catch((e) => e);
    expect(diagnosticOf(failure)).toBe("REAL_LAUNCH_DISABLED; blockers=11");

    const token = (await registry.execute({ method: "list", payload: {} }))
      .integrations[0]!.approvalToken;
    expect(token).toBeTruthy();
    await registry.execute({
      method: "verify",
      payload: {
        integrationId: "claude-code",
        approvalToken: token,
        approved: true,
      },
    });
    expect(registry.verifiedVersion("claude-code")).toBe("2.1.296");
    // LIVE_LAUNCH_DISABLED + 9 missing evidence items; the version blocker is gone.
    const clean = await host
      .execute(start(await host.execute(prepare)))
      .catch((e) => e);
    expect(diagnosticOf(clean)).toBe("REAL_LAUNCH_DISABLED; blockers=10");
    writeFileSync(join(workspace, "CLAUDE.md"), "workspace instructions");
    const refused = await host
      .execute(start(await host.execute(prepare)))
      .catch((e) => e);
    expect(diagnosticOf(refused)).toBe("REAL_LAUNCH_DISABLED; blockers=11");
    expect((refused as Error).message).toBe("REAL_LAUNCH_DISABLED");
  },
);

it("reports only allow-listed reason codes over real worker IPC and releases the lock on disconnect", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hardening-ipc-"));
  dirs.push(dir);
  const db = join(dir, "data.sqlite");
  const worker = fork(resolve("apps/worker/dist/index.cjs"), [db], {
    execArgv: [],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  await once(worker, "message", { signal: AbortSignal.timeout(8000) });
  expect(existsSync(db + ".lock")).toBe(true);
  const reply = once(worker, "message", { signal: AbortSignal.timeout(8000) });
  worker.send({
    protocol: "human-cli",
    version: 1,
    requestId: "r",
    command: {
      method: "prepare",
      payload: { integrationId: "claude-code", workspaceId: "forged" },
    },
  });
  const response = humanCliResponseSchema.parse((await reply)[0]);
  expect(response.ok).toBe(false);
  if (!response.ok) {
    expect(response.error).toContain("[WORKSPACE_UNKNOWN]");
    expect(response.error).not.toContain("forged");
  }
  const exited = once(worker, "exit", { signal: AbortSignal.timeout(10000) });
  worker.disconnect();
  expect((await exited)[0]).toBe(0);
  expect(existsSync(db + ".lock")).toBe(false);
}, 30000);
