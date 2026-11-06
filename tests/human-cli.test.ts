import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import { HumanCliHost } from "../apps/worker/src/human-cli-host";
import type { HumanCliState } from "../packages/contracts/src";

const dirs: string[] = [];
const hosts: HumanCliHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) void host.stop();
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
// Hosted Windows CI can expose TEMP via an alias rejected by the native
// path boundary. Use its canonical on-disk location; do not relax production checks.
async function fixture() {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), "human-cli-İ-"));
  dirs.push(dir);
  const workspace = join(dir, "workspace");
  mkdirSync(workspace);
  // Deliberately invalid executables: preparation must NEVER run a provider.
  writeFileSync(join(dir, "claude.exe"), "offline-claude");
  writeFileSync(join(dir, "codex.exe"), "offline-codex");
  const registry = new AgentRegistry({ directories: [dir], platform: "win32" });
  await registry.execute({ method: "discover", payload: {} });
  const host = new HumanCliHost(registry);
  hosts.push(host);
  const registered = await host.execute({
    method: "register-workspace",
    payload: { path: workspace },
  });
  prepare.payload.workspaceId = registered.workspaces[0]!.workspaceId;
  return { dir, workspace, registry, host };
}
const prepare = {
  method: "prepare",
  payload: { integrationId: "claude-code", workspaceId: "w" },
};
function start(state: HumanCliState) {
  return {
    method: "start",
    payload: {
      sessionId: state.session!.sessionId,
      approvalToken: state.session!.approvalToken,
      approved: true,
    },
  };
}
it.runIf(process.platform === "win32")(
  "bounds registrations and rejects replacement during duplicate registration",
  async () => {
    const { host, dir, workspace } = await fixture();
    for (let i = 1; i < 16; i++) {
      const path = join(dir, `workspace-${i}`);
      mkdirSync(path);
      await host.execute({ method: "register-workspace", payload: { path } });
    }
    const extra = join(dir, "extra");
    mkdirSync(extra);
    await expect(
      host.execute({ method: "register-workspace", payload: { path: extra } }),
    ).rejects.toThrow("WORKSPACE_LIMIT");
    renameSync(workspace, workspace + "-old");
    mkdirSync(workspace);
    await expect(
      host.execute({
        method: "register-workspace",
        payload: { path: workspace },
      }),
    ).rejects.toThrow("IDENTITY_CHANGED");
    expect(
      (await host.execute({ method: "list", payload: {} })).workspaces,
    ).toHaveLength(15);
  },
);
it.runIf(process.platform === "win32")(
  "prepares exact identities without launching, then consumes consent into a blocked result",
  async () => {
    const { host, workspace } = await fixture();
    const state = await host.execute(prepare);
    expect(state).toMatchObject({
      mode: "human-controlled",
      liveLaunch: false,
      managedExecution: false,
      session: { status: "prepared", workspacePath: workspace },
    });
    expect(state.session!.executable.path).toMatch(/claude\.exe$/);
    await expect(host.execute(start(state))).rejects.toThrow(
      "REAL_LAUNCH_DISABLED",
    );
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
    expect(
      (await host.execute({ method: "list", payload: {} })).session,
    ).toMatchObject({ status: "blocked", approvalToken: null });
  },
);
it.runIf(process.platform === "win32")(
  "pins registration before preparation, deduplicates and rejects replacement",
  async () => {
    const { host, workspace } = await fixture();
    const before = await host.execute({ method: "list", payload: {} });
    const again = await host.execute({
      method: "register-workspace",
      payload: { path: workspace },
    });
    expect(again.workspaces).toEqual(before.workspaces);
    renameSync(workspace, workspace + "-old");
    mkdirSync(workspace);
    await expect(host.execute(prepare)).rejects.toThrow("IDENTITY_CHANGED");
    expect(
      (await host.execute({ method: "list", payload: {} })).workspaces,
    ).toEqual([]);
  },
);

it.runIf(process.platform === "win32")(
  "consumes simultaneous approvals once and expires during identity verification",
  async () => {
    const { host, registry } = await fixture();
    const state = await host.execute(prepare);
    const identity = await registry.terminalIdentity("claude-code");
    let finish!: () => void;
    vi.spyOn(registry, "terminalIdentity").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(identity);
        }),
    );
    const pending = host.execute(start(state));
    await expect(host.execute(start(state))).rejects.toThrow("BUSY");
    vi.spyOn(Date, "now").mockReturnValue(state.session!.expiresAt + 1);
    finish();
    await expect(pending).rejects.toThrow("CONSENT_EXPIRED");
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
  },
);

it.runIf(process.platform === "win32")(
  "rejects malformed registration, file roots and traversal without storing authority",
  async () => {
    const { host, dir } = await fixture();
    for (const path of [
      join(dir, "claude.exe"),
      dir + "\\..\\escape",
      "\\\\server\\share",
      "C:\\",
      dir + "\\missing",
    ]) {
      await expect(
        host.execute({ method: "register-workspace", payload: { path } }),
      ).rejects.toThrow();
    }
    expect(
      (await host.execute({ method: "list", payload: {} })).workspaces,
    ).toHaveLength(1);
  },
);
it
  .runIf(process.platform === "win32")
  .each(["executable", "workspace", "rediscovery"])(
  "invalidates consent after %s changes",
  async (change) => {
    const { host, dir, workspace, registry } = await fixture();
    const state = await host.execute(prepare);
    if (change === "executable")
      writeFileSync(join(dir, "claude.exe"), "changed");
    if (change === "workspace") {
      renameSync(workspace, workspace + "-old");
      mkdirSync(workspace);
    }
    if (change === "rediscovery")
      await registry.execute({ method: "discover", payload: {} });
    await expect(host.execute(start(state))).rejects.toThrow(
      "IDENTITY_CHANGED",
    );
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
  },
);
it.runIf(process.platform === "win32").each([60001, -1])(
  "expires approvals on timeout or clock rollback (%s)",
  async (delta) => {
    const { host } = await fixture();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const state = await host.execute(prepare);
    vi.spyOn(Date, "now").mockReturnValue(now + delta);
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
    expect(
      (await host.execute({ method: "list", payload: {} })).session?.status,
    ).toBe("expired");
  },
);
it.runIf(process.platform === "win32")(
  "requires stop consent, rejects cross-owner references and never replays after restart",
  async () => {
    const { host, registry } = await fixture();
    const state = await host.execute(prepare);
    await expect(
      host.execute({
        method: "stop",
        payload: { sessionId: state.session!.sessionId, approved: false },
      }),
    ).rejects.toThrow();
    const other = new HumanCliHost(registry);
    await expect(other.execute(start(state))).rejects.toThrow("SESSION_OWNER");
    await host.execute({
      method: "stop",
      payload: { sessionId: state.session!.sessionId, approved: true },
    });
    await expect(host.execute(start(state))).rejects.toThrow("CONSENT_INVALID");
    await host.stop();
    await expect(host.execute(prepare)).rejects.toThrow("OWNER_STOPPED");
    expect(
      (await other.execute({ method: "list", payload: {} })).session,
    ).toBeNull();
  },
);
it.runIf(process.platform === "win32")(
  "rejects unregistered workspaces, junction roots, overlapping preparation and late preparation after disconnect",
  async () => {
    const { host, registry, dir, workspace } = await fixture();
    await expect(new HumanCliHost(registry).execute(prepare)).rejects.toThrow(
      "WORKSPACE_UNKNOWN",
    );
    symlinkSync(workspace, join(dir, "alias"), "junction");
    await expect(
      new HumanCliHost(registry).execute({
        method: "register-workspace",
        payload: { path: join(dir, "alias") },
      }),
    ).rejects.toThrow();
    const pending = host.execute(prepare);
    await expect(host.execute(prepare)).rejects.toThrow("BUSY");
    await host.stop();
    await expect(pending).rejects.toThrow("OWNER_STOPPED");
  },
);
