import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import { HumanCliHost } from "../apps/worker/src/human-cli-host";
import type { HumanCliState } from "../packages/contracts/src";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "human-cli-İ-"));
  dirs.push(dir);
  const workspace = join(dir, "workspace");
  mkdirSync(workspace);
  // Deliberately invalid executables: preparation must NEVER run a provider.
  writeFileSync(join(dir, "claude.exe"), "offline-claude");
  writeFileSync(join(dir, "codex.exe"), "offline-codex");
  const registry = new AgentRegistry({ directories: [dir], platform: "win32" });
  await registry.execute({ method: "discover", payload: {} });
  const host = new HumanCliHost(registry, new Map([["w", workspace]]));
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
    const { host, registry, workspace } = await fixture();
    const state = await host.execute(prepare);
    await expect(
      host.execute({
        method: "stop",
        payload: { sessionId: state.session!.sessionId, approved: false },
      }),
    ).rejects.toThrow();
    const other = new HumanCliHost(registry, new Map([["w", workspace]]));
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
      new HumanCliHost(registry, new Map([["w", join(dir, "alias")]])).execute(
        prepare,
      ),
    ).rejects.toThrow();
    const pending = host.execute(prepare);
    await expect(host.execute(prepare)).rejects.toThrow("BUSY");
    await host.stop();
    await expect(pending).rejects.toThrow("OWNER_STOPPED");
  },
);
