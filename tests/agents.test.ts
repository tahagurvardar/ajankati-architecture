import { describe, it, expect, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import * as fsAsync from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRegistry,
  parseVersion,
  windowsSearchDirectories,
  runVersion,
  codexShimTemplate,
} from "../apps/worker/src/agent-registry";
import { agentCommandSchema } from "../packages/contracts/src";
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ajan-İ boşluk-&-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("agent discovery boundaries", () => {
  it("reads only the bounded shim, never credential/config files or junction targets in credential roots", async () => {
    const dir = fixture();
    const secretDir = join(dir, ".codex");
    mkdirSync(secretDir);
    writeFileSync(join(secretDir, "auth.json"), "credential sentinel");
    writeFileSync(join(secretDir, "codex.cmd"), "credential sentinel");
    const alias = join(dir, "tools");
    symlinkSync(secretDir, alias, "junction");
    writeFileSync(join(dir, "codex.cmd"), "@echo off");
    const opened = vi.mocked(fsAsync.open);
    const registry = new AgentRegistry({
      directories: [alias, dir],
      platform: "win32",
    });
    await registry.execute({ method: "discover", payload: {} });
    expect(opened.mock.calls.map((call) => call[0])).toEqual([
      join(dir, "codex.cmd"),
    ]);
  });
  it("rejects obsolete approvals after rediscovery and blocks overlapping verification", async () => {
    const dir = fixture();
    writeFileSync(join(dir, "claude.exe"), "fixture");
    let finish!: (value: { output: string; error: null }) => void;
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const old = (await registry.execute({ method: "discover", payload: {} }))
      .integrations[0]!;
    const current = (
      await registry.execute({ method: "discover", payload: {} })
    ).integrations[0]!;
    const verify = (approvalToken: string) =>
      registry.execute({
        method: "verify",
        payload: {
          integrationId: "claude-code",
          approvalToken,
          approved: true,
        },
      });
    await expect(verify(old.approvalToken!)).rejects.toThrow();
    const checking = verify(current.approvalToken!);
    await expect(
      registry.execute({ method: "discover", payload: {} }),
    ).rejects.toThrow();
    await expect.poll(() => typeof finish).toBe("function");
    finish({ output: "2.1.0 (Claude Code)", error: null });
    await checking;
  });
  it("rejects renderer paths, arguments, environment, enable and unapproved verification", () => {
    for (const payload of [
      { path: "C:\\evil.exe" },
      { argv: ["--help"] },
      { env: {} },
    ])
      expect(
        agentCommandSchema.safeParse({ method: "discover", payload }).success,
      ).toBe(false);
    expect(
      agentCommandSchema.safeParse({ method: "enable", payload: {} }).success,
    ).toBe(false);
    expect(
      agentCommandSchema.safeParse({
        method: "verify",
        payload: { integrationId: "claude-code" },
      }).success,
    ).toBe(false);
  });
  it("ignores relative, empty, UNC, device and credential directories", () => {
    expect(
      windowsSearchDirectories(
        ';.;relative;C:relative;\\\\host\\share;\\\\?\\C:\\bin;C:\\Users\\a\\.codex;C:\\bin;"C:\\Tools Space";C:\\BIN',
        "D:\\project",
      ),
    ).toEqual(["C:\\bin", "C:\\Tools Space"]);
  });
  it("parses only bounded provider-specific version output", () => {
    expect(parseVersion("claude-code", "2.1.99 (Claude Code)\r\n")).toBe(
      "2.1.99",
    );
    expect(parseVersion("codex-cli", "codex-cli 0.163.0\n")).toBe("0.163.0");
    for (const output of [
      "42",
      "codex-cli latest",
      "secret\ncodex-cli 0.1.0",
      "codex-cli 0.1.0\x1b[0m",
    ])
      expect(parseVersion("codex-cli", output)).toBeNull();
    expect(parseVersion("codex-cli", "codex-cli 99.0.0-beta.1")).toBe(
      "99.0.0-beta.1",
    );
  });
  it("reports missing CLIs without invoking a probe", async () => {
    const registry = new AgentRegistry({
      directories: [fixture()],
      platform: "win32",
    });
    const state = await registry.execute({ method: "discover", payload: {} });
    expect(
      state.integrations.every(
        (x) =>
          !x.discovered &&
          !x.verified &&
          !x.enabled &&
          x.error?.code === "NOT_FOUND",
      ),
    ).toBe(true);
  });
  it("resolves exe, binds one-time approval to identity, never infers managed capabilities", async () => {
    const dir = fixture();
    writeFileSync(join(dir, "claude.exe"), "fixture");
    let calls = 0;
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe: async () => {
        calls++;
        return { output: "2.1.99 (Claude Code)", error: null };
      },
    });
    const first = (await registry.execute({ method: "discover", payload: {} }))
      .integrations[0]!;
    expect(first.discovered).toBe(true);
    expect(calls).toBe(0);
    const command = {
      method: "verify" as const,
      payload: {
        integrationId: first.integrationId,
        approvalToken: first.approvalToken!,
        approved: true as const,
      },
    };
    const verified = (await registry.execute(command)).integrations[0]!;
    expect(verified.verified).toBe(true);
    expect(verified.detectedVersion).toBe("2.1.99");
    expect(verified.enabled).toBe(false);
    expect(verified.capabilities.processOwnership).toBe("unknown");
    expect(verified.capabilities.managedTasks).toBe("unsupported");
    await expect(registry.execute(command)).rejects.toThrow();
    expect(calls).toBe(1);
    const next = (await registry.execute({ method: "discover", payload: {} }))
      .integrations[0]!;
    writeFileSync(join(dir, "claude.exe"), "changed fixture");
    const changed = await registry.execute({
      ...command,
      payload: { ...command.payload, approvalToken: next.approvalToken! },
    });
    expect(changed.integrations[0]!.error?.code).toBe("IDENTITY_CHANGED");
    expect(calls).toBe(1);
  });
  it("does not execute arbitrary cmd wrappers or inspect credential content", async () => {
    const dir = fixture();
    writeFileSync(join(dir, "codex.cmd"), "@echo off\r\necho secret & whoami");
    mkdirSync(join(dir, ".codex"));
    writeFileSync(join(dir, ".codex", "auth.json"), "credential sentinel");
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe: async () => {
        throw new Error("must not launch");
      },
    });
    const state = await registry.execute({ method: "discover", payload: {} });
    const codex = state.integrations[1]!;
    expect(codex.discovered).toBe(true);
    expect(codex.error?.code).toBe("UNSUPPORTED_WRAPPER");
    expect(codex.approvalToken).toBeNull();
    expect(JSON.stringify(state)).not.toContain("credential sentinel");
  });
  it("resolves an exact npm cmd shim to a fixed native binary without a shell", async () => {
    const dir = fixture();
    writeFileSync(
      join(dir, "codex.cmd"),
      codexShimTemplate().replace(/\n/g, "\r\n"),
    );
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const native = join(
      dir,
      "node_modules",
      "@openai",
      "codex",
      "vendor",
      `${arch}-pc-windows-msvc`,
      "bin",
    );
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "codex.exe"), "native fixture");
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe: async (path) => {
        expect(path).toBe(join(native, "codex.exe"));
        return { output: "codex-cli 99.0.0-beta.1", error: null };
      },
    });
    const row = (await registry.execute({ method: "discover", payload: {} }))
      .integrations[1]!;
    expect(row.executable?.kind).toBe("npm-native");
    const verified = (
      await registry.execute({
        method: "verify",
        payload: {
          integrationId: row.integrationId,
          approvalToken: row.approvalToken!,
          approved: true,
        },
      })
    ).integrations[1]!;
    expect(verified.detectedVersion).toBe("99.0.0-beta.1");
    expect(verified.capabilities.sandbox).toBe("unknown");
    expect(verified.enabled).toBe(false);
  });
  it("does not promote unknown version output or launch failures", async () => {
    const dir = fixture();
    writeFileSync(join(dir, "codex.exe"), "fixture");
    for (const result of [
      { output: "unrecognized", error: null },
      { output: "", error: "TIMEOUT" as const },
      { output: "", error: "LAUNCH_FAILED" as const },
    ]) {
      const registry = new AgentRegistry({
        directories: [dir],
        platform: "win32",
        probe: async () => result,
      });
      const row = (await registry.execute({ method: "discover", payload: {} }))
        .integrations[1]!;
      const checked = (
        await registry.execute({
          method: "verify",
          payload: {
            integrationId: row.integrationId,
            approvalToken: row.approvalToken!,
            approved: true,
          },
        })
      ).integrations[1]!;
      expect(checked.verified).toBe(false);
      expect(checked.lastVerificationAt).not.toBeNull();
      expect(checked.capabilities.permissions).toBe("unknown");
    }
  });
  it("bounds a real process and reports failed launch", async () => {
    expect(
      (await runVersion(join(fixture(), "missing.exe"), fixture())).error,
    ).toBe("LAUNCH_FAILED");
    // Node's --version is a real harmless process through the same fixed-argument runner.
    expect((await runVersion(process.execPath, fixture())).output).toMatch(
      /^v24\./,
    );
  });
});
