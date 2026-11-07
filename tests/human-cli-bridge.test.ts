import { afterEach, expect, it, vi } from "vitest";
import { HumanCliBridge } from "../apps/desktop/main/human-cli-bridge";
import { HumanCliHost } from "../apps/worker/src/human-cli-host";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import type { HumanCliState } from "../packages/contracts/src";

// Platform-independent lifecycle model. Real native rejection is tested separately on win32.
vi.mock("../apps/worker/src/native-path-boundary", () => ({
  withNativePath: (
    path: string,
    _directory: boolean,
    inspect: (value: unknown) => unknown,
  ) => inspect({ finalPath: path, volumeSerial: "1", fileId: "fixture" }),
}));
const hosts: HumanCliHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function fixture(
  confirm: (session: NonNullable<HumanCliState["session"]>) => Promise<boolean>,
) {
  const registry = new AgentRegistry();
  vi.spyOn(registry, "terminalIdentity").mockResolvedValue({
    discoveryId: "00000000-0000-4000-8000-000000000001",
    executable: {
      path: "C:\\fixture\\cli.exe",
      kind: "exe",
      sourcePath: "C:\\fixture\\cli.exe",
      sourceCanonicalPath: "C:\\fixture\\cli.exe",
      fingerprint: "offline",
      sourceFingerprint: "offline",
    },
  });
  // The fixture executable does not exist; pin/scan are injected, never skipped in production.
  const host = new HumanCliHost(registry, {
    digest: async () => "a".repeat(64),
    startupConfig: () => [],
    protectedRoots: [],
  });
  hosts.push(host);
  const send = vi.fn((command: unknown) => host.execute(command));
  const bridge = new HumanCliBridge(
    send,
    async () => "C:\\fixture\\workspace",
    confirm,
  );
  const registered = await bridge.execute({
    method: "select-workspace",
    payload: {},
  });
  const prepared = await bridge.execute({
    method: "prepare",
    payload: {
      integrationId: "claude-code",
      workspaceId: registered!.workspaces[0]!.workspaceId,
    },
  });
  return { host, bridge, send, prepared: prepared! };
}

it("shows exact worker identity, hides tokens and consumes approval without any process launch", async () => {
  const confirm = vi.fn(async () => true);
  const { host, bridge, prepared } = await fixture(confirm);
  expect(prepared.session).not.toHaveProperty("approvalToken");
  const approve = {
    method: "approve",
    payload: { sessionId: prepared.session!.sessionId },
  };
  await expect(bridge.execute(approve)).rejects.toThrow("REAL_LAUNCH_DISABLED");
  expect(confirm.mock.calls[0]).toMatchObject([
    {
      workspacePath: "C:\\fixture\\workspace",
      executable: { fingerprint: "offline" },
    },
  ]);
  await expect(bridge.execute(approve)).rejects.toThrow("CONSENT_INVALID");
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(
    (await host.execute({ method: "list", payload: {} })).session,
  ).toMatchObject({ status: "blocked", approvalToken: null });
});

it.each(["cancel", "failure"])(
  "invalidates consent after native dialog %s and allows a fresh preparation",
  async (mode) => {
    const { bridge, prepared } = await fixture(async () => {
      if (mode === "failure") throw new Error("dialog failed");
      return false;
    });
    const request = bridge.execute({
      method: "approve",
      payload: { sessionId: prepared.session!.sessionId },
    });
    if (mode === "failure")
      await expect(request).rejects.toThrow("CONSENT_FAILED");
    else expect((await request)?.session?.status).toBe("stopped");
    const state = await bridge.execute({ method: "list", payload: {} });
    expect(state!.session!.status).toBe("stopped");
    expect(
      (await bridge.execute({
        method: "prepare",
        payload: {
          integrationId: "claude-code",
          workspaceId: prepared.workspaces[0]!.workspaceId,
        },
      }))!.session!.sessionId,
    ).not.toBe(prepared.session!.sessionId);
  },
);

it("rejects cross-session consent, injected tokens and direct start/register commands", async () => {
  const { bridge, prepared } = await fixture(async () => true);
  const other = await fixture(async () => true);
  await expect(
    other.bridge.execute({
      method: "approve",
      payload: { sessionId: prepared.session!.sessionId },
    }),
  ).rejects.toThrow("CONSENT_INVALID");
  for (const input of [
    {
      method: "approve",
      payload: { sessionId: prepared.session!.sessionId, approved: true },
    },
    { method: "register-workspace", payload: { path: "C:\\injected" } },
    { method: "start", payload: {} },
    { method: "shell", payload: {} },
  ])
    await expect(bridge.execute(input)).rejects.toThrow();
});

it.each(["expiry", "shutdown"])(
  "rejects simultaneous and late approval after %s",
  async (mode) => {
    let finish!: (value: boolean) => void;
    const { bridge, host, prepared, send } = await fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const command = {
      method: "approve",
      payload: { sessionId: prepared.session!.sessionId },
    };
    const pending = bridge.execute(command);
    await Promise.resolve();
    await expect(bridge.execute(command)).rejects.toThrow("BUSY");
    if (mode === "expiry")
      vi.spyOn(Date, "now").mockReturnValue(prepared.session!.expiresAt + 1);
    else {
      bridge.close();
      await host.stop();
    }
    finish(true);
    await expect(pending).rejects.toThrow(
      mode === "expiry" ? "CONSENT_INVALID" : "OWNER_STOPPED",
    );
    if (mode === "shutdown")
      expect(
        send.mock.calls.some(
          ([command]) => (command as { method: string }).method === "start",
        ),
      ).toBe(false);
  },
);

it("actively expires an idle preparation without a list request", async () => {
  vi.useFakeTimers();
  const { host, prepared } = await fixture(async () => true);
  await vi.advanceTimersByTimeAsync(60001);
  expect(
    (await host.execute({ method: "list", payload: {} })).session,
  ).toMatchObject({
    sessionId: prepared.session!.sessionId,
    status: "expired",
    approvalToken: null,
  });
});

it("rejects renderer paths and never registers a cancelled picker", async () => {
  const send = vi.fn();
  const choose = vi.fn(async () => null);
  const bridge = new HumanCliBridge(send, choose, vi.fn());
  await expect(
    bridge.execute({
      method: "select-workspace",
      payload: { path: "C:\\injected" },
    }),
  ).rejects.toThrow();
  expect(choose).not.toHaveBeenCalled();
  expect(
    await bridge.execute({ method: "select-workspace", payload: {} }),
  ).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it("registers only the native selection and rejects a late picker after owner shutdown", async () => {
  let selected!: (path: string) => void;
  const send = vi.fn();
  const bridge = new HumanCliBridge(
    send,
    () =>
      new Promise<string>((resolve) => {
        selected = resolve;
      }),
    vi.fn(),
  );
  const pending = bridge.execute({ method: "select-workspace", payload: {} });
  await expect(
    bridge.execute({ method: "select-workspace", payload: {} }),
  ).rejects.toThrow("BUSY");
  bridge.close();
  selected("C:\\safe");
  await expect(pending).rejects.toThrow("OWNER_STOPPED");
  expect(send).not.toHaveBeenCalled();
});
