import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir, release } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { windowsSandboxEvidenceSchema } from "../packages/contracts/src/windows-sandbox";

const executable = resolve(
  "apps/worker/native/build/Release/sandbox_fixture.exe",
);
const run = promisify(execFile);
function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "ak-sandbox-"));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  mkdirSync(join(root, "outside"));
  writeFileSync(
    join(root, "outside", "secret.txt"),
    "synthetic outside sentinel",
  );
  writeFileSync(join(workspace, "approved.txt"), "approved sentinel");
  writeFileSync(join(workspace, "replacement.txt"), "replacement sentinel");
  symlinkSync(join(root, "outside"), join(workspace, "junction"), "junction");
  return { root, workspace };
}
async function probe(
  workspace: string,
  scenario: string,
  port = 0,
  leaseHeld = false,
) {
  const { stdout } = await run(executable, [scenario, String(port)], {
    cwd: workspace,
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4096,
    env: { SystemRoot: process.env.SystemRoot },
  });
  const native = JSON.parse(stdout);
  expect(native.tokenRestricted).toBe(true);
  expect(native.jobMember).toBe(true);
  expect(native.cleaned).toBe(true);
  const report = windowsSandboxEvidenceSchema.parse({
    version: 1,
    mechanism: "restricted-token-job-v1",
    platform: "win32",
    osRelease: release(),
    architecture: process.arch,
    fixtureSha256: createHash("sha256")
      .update(readFileSync(executable))
      .digest("hex"),
    collectedAt: Date.now(),
    executionAllowed: false,
    liveExecution: false,
    capabilities: {
      filesystem: "UNKNOWN",
      network: "UNKNOWN",
      childIsolation: "UNKNOWN",
    },
    observations: [
      {
        scenario,
        boundaryContext: leaseHeld ? "native-lease-held" : "none",
        outcome:
          native.error === 0
            ? "ALLOWED"
            : [5, 32].includes(native.error)
              ? "DENIED"
              : "ERROR",
        win32Error: native.error,
      },
    ],
  });
  console.log(JSON.stringify(report));
  return report.observations[0];
}

describe.runIf(process.platform === "win32")(
  "Windows sandbox negative evidence (no provider)",
  () => {
    it("rejects a command outside the fixed scenario allowlist", async () => {
      const f = fixture();
      try {
        await expect(
          run(executable, ["write --probe", "0"], {
            cwd: f.workspace,
            windowsHide: true,
            timeout: 10000,
          }),
        ).rejects.toMatchObject({ code: 2 });
        expect(readFileSync(join(f.workspace, "approved.txt"), "utf8")).toBe(
          "approved sentinel",
        );
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    });
    it.each([
      "approved-read",
      "outside-read",
      "traversal-read",
      "junction-read",
      "child-read",
    ])("restricted token and job do not prevent %s", async (scenario) => {
      const f = fixture();
      try {
        expect((await probe(f.workspace, scenario)).outcome).toBe("ALLOWED");
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    });
    it.each(["write", "delete", "rename", "replace"])(
      "read-only intent does not prevent %s without an OS lease",
      async (scenario) => {
        const f = fixture();
        try {
          expect((await probe(f.workspace, scenario)).outcome).toBe("ALLOWED");
          const target = join(f.workspace, "approved.txt");
          if (scenario === "delete" || scenario === "rename")
            expect(existsSync(target)).toBe(false);
          else
            expect(readFileSync(target, "utf8")).toBe(
              scenario === "write" ? "changed" : "replacement sentinel",
            );
          if (scenario === "rename")
            expect(readFileSync(target + ".renamed", "utf8")).toBe(
              "approved sentinel",
            );
        } finally {
          rmSync(f.root, { recursive: true, force: true });
        }
      },
    );
    it.each(["write", "delete", "rename", "replace"])(
      "native lease denies %s only while held; it is not a sandbox",
      async (scenario) => {
        const f = fixture();
        try {
          const boundary = createRequire(import.meta.url)(
            resolve("apps/worker/dist/path_boundary.node"),
          );
          const path = join(f.workspace, "approved.txt");
          const owner = boundary.open(path, false);
          try {
            const before = boundary.snapshot(owner);
            expect((await probe(f.workspace, scenario, 0, true)).outcome).toBe(
              "DENIED",
            );
            expect(boundary.snapshot(owner)).toEqual(before);
            expect(readFileSync(path, "utf8")).toBe("approved sentinel");
          } finally {
            boundary.close(owner);
          }
          expect((await probe(f.workspace, scenario)).outcome).toBe("ALLOWED");
        } finally {
          rmSync(f.root, { recursive: true, force: true });
        }
      },
    );
    it("denies direct job breakaway, without claiming all child escapes are prevented", async () => {
      const f = fixture();
      try {
        expect((await probe(f.workspace, "breakaway")).outcome).toBe("DENIED");
      } finally {
        rmSync(f.root, { recursive: true, force: true });
      }
    });
    it("connects to a controlled IPv4 loopback listener: network isolation is unproven", async () => {
      const f = fixture();
      let connections = 0;
      const server = createServer((socket) => {
        connections++;
        socket.end();
      });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing loopback fixture");
        expect(
          (await probe(f.workspace, "loopback", address.port)).outcome,
        ).toBe("ALLOWED");
        expect(connections).toBe(1);
      } finally {
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          );
        rmSync(f.root, { recursive: true, force: true });
      }
    });
  },
);
