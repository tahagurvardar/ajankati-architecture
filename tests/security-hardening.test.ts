import { afterEach, expect, it } from "vitest";
const win = (path: string) => path.replaceAll("/", String.fromCharCode(92));
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShutdown } from "../apps/worker/src/shutdown";
import { sha256File } from "../apps/worker/src/executable-digest";
import {
  defaultProtectedRoots,
  startupConfigSurface,
  workspaceScopeViolation,
} from "../apps/worker/src/workspace-policy";
import {
  ACCEPTED_EVIDENCE,
  PINNED_VERSIONS,
  REQUIRED_EVIDENCE,
  evaluateLaunchReadiness,
} from "../apps/worker/src/launch-readiness";
import { diagnosticOf } from "../apps/worker/src/human-cli-host";
import { isTrustedSender } from "../apps/desktop/main/ipc-guard";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "security-hardening-"));
  dirs.push(dir);
  return dir;
}

it("runs every shutdown step after a throwing or hanging one and reports names only", async () => {
  const ran: string[] = [];
  const report = await runShutdown(
    [
      { name: "a", run: () => void ran.push("a") },
      {
        name: "throws",
        run: () => {
          throw new Error(
            "secret " + ["C:", "Users", "x", ".claude"].join("\\"),
          );
        },
      },
      { name: "hangs", run: () => new Promise<void>(() => {}) },
      { name: "rejects", run: () => Promise.reject(new Error("late")) },
      { name: "z", run: () => void ran.push("z") },
    ],
    50,
  );
  expect(ran).toEqual(["a", "z"]);
  expect(report.failed).toEqual(["throws", "hangs", "rejects"]);
  expect(JSON.stringify(report)).not.toContain("secret");
});

it("digests content, not metadata, and honours abort and size bounds", async () => {
  const file = join(temp(), "image.exe");
  writeFileSync(file, "same-size-A");
  const a = await sha256File(file);
  writeFileSync(file, "same-size-B");
  expect(await sha256File(file)).not.toBe(a);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  await expect(sha256File(file, undefined, 3)).rejects.toThrow(
    "DIGEST_TOO_LARGE",
  );
  const controller = new AbortController();
  controller.abort();
  await expect(sha256File(file, controller.signal)).rejects.toThrow(
    "DIGEST_ABORTED",
  );
  await expect(sha256File(join(temp(), "missing.exe"))).rejects.toThrow();
});

it.each([
  [win("C:/Users/me"), true],
  [win("c:/users/ME/"), true],
  [win("C:/Users"), true],
  [win("C:/Users/me/AppData"), true],
  [win("C:/Windows"), true],
  [win("C:/Program Files"), true],
  [win("C:/"), true],
  [win("C:/Users/me/projects/app"), false],
  [win("C:/Users/me/AppData/Local/Temp/ws"), false],
  [win("D:/dev/app"), false],
  [win("C:/Users/mellow"), false],
])("workspace scope policy for %s (too broad: %s)", (path, broad) => {
  const roots = defaultProtectedRoots(
    { SystemRoot: win("C:/Windows") },
    win("C:/Users/me"),
  );
  expect(workspaceScopeViolation(path, roots)).toBe(
    broad ? "WORKSPACE_TOO_BROAD" : null,
  );
});

it("derives protected roots from the account profile, ignoring non-Windows homes", () => {
  expect(defaultProtectedRoots({}, "/home/me")).toEqual([]);
  expect(defaultProtectedRoots({}, win("C:/Users/me"))).toEqual([
    win("C:/Users/me"),
    win("C:/Users/me/AppData"),
  ]);
});

it("reports provider startup-config entries by lstat existence only, failing closed on errors", () => {
  const dir = temp();
  expect(startupConfigSurface(dir)).toEqual([]);
  writeFileSync(join(dir, "CLAUDE.md"), "x");
  writeFileSync(join(dir, ".mcp.json"), "{}");
  expect(startupConfigSurface(dir)).toEqual([".mcp.json", "CLAUDE.md"]);
  const denied = (() => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  }) as never;
  expect(startupConfigSurface(dir, denied)).toHaveLength(7);
});

it("never reports launch readiness without every evidence item for the exact version", () => {
  expect(Object.keys(ACCEPTED_EVIDENCE)).toEqual([]);
  for (const id of ["claude-code", "codex-cli"] as const) {
    const none = evaluateLaunchReadiness({
      integrationId: id,
      verifiedVersion: PINNED_VERSIONS[id],
      startupConfig: [],
    });
    expect(none.go).toBe(false);
    expect(none.blockers).toContain("LIVE_LAUNCH_DISABLED");
    expect(none.blockers).toHaveLength(1 + REQUIRED_EVIDENCE.length);
    const unverified = evaluateLaunchReadiness({
      integrationId: id,
      verifiedVersion: null,
      startupConfig: [],
    });
    expect(unverified.blockers).toContain("VERSION_UNVERIFIED");
  }
  // Older Codex evidence must not transfer to 0.167.0.
  const old = evaluateLaunchReadiness({
    integrationId: "codex-cli",
    verifiedVersion: "0.164.0",
    startupConfig: [],
    evidence: { "codex-cli": { "0.164.0": REQUIRED_EVIDENCE } },
  });
  expect(old.blockers).toContain("VERSION_NOT_PINNED");
  expect(old.go).toBe(false);
  const complete = {
    "claude-code": { "2.1.296": REQUIRED_EVIDENCE },
  } as const;
  expect(
    evaluateLaunchReadiness({
      integrationId: "claude-code",
      verifiedVersion: "2.1.296",
      startupConfig: [],
      evidence: complete,
    }).blockers,
  ).toEqual(["LIVE_LAUNCH_DISABLED"]);
  expect(
    evaluateLaunchReadiness({
      integrationId: "claude-code",
      verifiedVersion: "2.1.296",
      startupConfig: [".claude"],
      evidence: complete,
      liveLaunchEnabled: true,
    }).blockers,
  ).toEqual(["WORKSPACE_STARTUP_CONFIG_PRESENT"]);
});

it("exposes only allow-listed reason codes, never arbitrary error text", () => {
  expect(diagnosticOf(new Error("IDENTITY_CHANGED"))).toBe("IDENTITY_CHANGED");
  expect(
    diagnosticOf(
      Object.assign(new Error("REAL_LAUNCH_DISABLED"), { blockers: 11 }),
    ),
  ).toBe("REAL_LAUNCH_DISABLED; blockers=11");
  expect(
    diagnosticOf(new Error("ENOENT " + win("C:/Users/me/.claude/x"))),
  ).toBeNull();
  expect(diagnosticOf("IDENTITY_CHANGED")).toBeNull();
});

it("accepts IPC only from the live main frame of the trusted window at the exact URL", () => {
  const main = { url: "file:///app/index.html" };
  const contents = { mainFrame: main };
  const context = {
    quitting: false,
    webContents: contents,
    trustedUrl: main.url,
  };
  expect(
    isTrustedSender({ sender: contents, senderFrame: main }, context),
  ).toBe(true);
  for (const bad of [
    { sender: {}, senderFrame: main },
    { sender: contents, senderFrame: null },
    { sender: contents, senderFrame: undefined },
    { sender: contents, senderFrame: { url: main.url } },
    { sender: contents, senderFrame: { url: "file:///evil.html" } },
  ])
    expect(isTrustedSender(bad, context)).toBe(false);
  expect(
    isTrustedSender(
      { sender: contents, senderFrame: { ...main, url: "file:///other" } },
      { ...context, webContents: { mainFrame: main } },
    ),
  ).toBe(false);
  expect(
    isTrustedSender(
      { sender: contents, senderFrame: main },
      { ...context, quitting: true },
    ),
  ).toBe(false);
  expect(
    isTrustedSender(
      { sender: contents, senderFrame: main },
      { ...context, webContents: undefined },
    ),
  ).toBe(false);
});
