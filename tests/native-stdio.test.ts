import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fork } from "node:child_process";

type Native = {
  open(profile: string, stage?: string, checkpoint?: string): object;
  snapshot(owner: object): {
    active: number;
    pid: number;
    verified: boolean;
    handles: number;
    exited: boolean;
    members: number[];
    unexpectedHandleInherited: boolean;
  };
  read(owner: object, stderr: boolean): Buffer;
  write(owner: object, data: Buffer): void;
  stop(owner: object): boolean;
  close(owner: object): void;
};
const nativePath = resolve(
  "apps/worker/native/build/Release/stdio_owner_test.node",
);
const load = () => createRequire(import.meta.url)(nativePath) as Native;

it
  .runIf(process.platform === "win32")
  .each(["launch-timeout", "resume-timeout"])(
  "rejects an expired native deadline at %s without running the target",
  (stage) => {
    const native = load();
    expect(() => {
      let owner: object | undefined;
      try {
        owner = native.open(process.cwd(), stage);
      } finally {
        if (owner) native.close(owner);
      }
    }).toThrow("LAUNCH_TIMEOUT");
  },
);

it.runIf(process.platform === "win32")(
  "locks the verified image against replacement for its lifetime",
  () => {
    const native = load();
    const owner = native.open(process.cwd());
    const image = resolve("apps/worker/native/build/Release/stdio_fixture.exe");
    try {
      expect(() => renameSync(image, image + ".replaced")).toThrow();
    } finally {
      native.close(owner);
    }
  },
);

it.runIf(process.platform === "win32")(
  "production hash pin rejects a different valid PE executable",
  () => {
    const directory = mkdtempSync(resolve(tmpdir(), "ak-identity-"));
    copyFileSync(
      resolve("apps/worker/native/build/Release/stdio_owner.node"),
      resolve(directory, "stdio_owner.node"),
    );
    copyFileSync(
      resolve("apps/worker/native/build/Release/stdio_fixture.exe"),
      resolve(directory, "codex.exe"),
    );
    const native = createRequire(import.meta.url)(
      resolve(directory, "stdio_owner.node"),
    ) as Native;
    expect(() => native.open(directory)).toThrow("IDENTITY_REJECTED");
  },
);

it.runIf(process.platform === "win32")(
  "creates a tree already owned before its first instruction and confirms cleanup",
  async () => {
    const path = resolve(
      "apps/worker/native/build/Release/stdio_owner_test.node",
    );
    expect(existsSync(path), "native stdio owner must be built").toBe(true);
    const native = createRequire(import.meta.url)(path);
    const owner = native.open(process.cwd(), "", "");
    try {
      await expect
        .poll(() => native.snapshot(owner).active, { timeout: 3000 })
        .toBeGreaterThanOrEqual(3);
      expect(native.snapshot(owner).verified).toBe(true);
      native.write(owner, Buffer.from('{"method":"initialize"}\n'));
      let response = "";
      await expect
        .poll(
          () => {
            response += native.read(owner, false).toString();
            return response;
          },
          { timeout: 3000 },
        )
        .toContain('"userAgent":"fixture"');
      expect(native.snapshot(owner).unexpectedHandleInherited).toBe(false);
      expect(native.stop(owner)).toBe(true);
      expect(native.snapshot(owner).active).toBe(0);
    } finally {
      native.close(owner);
    }
  },
);

it.runIf(process.platform === "win32")(
  "rejects identity and creation failures without retaining the single-owner slot",
  () => {
    const native = load();
    expect(() => native.open(process.cwd(), "identity", "")).toThrow(
      "IDENTITY_REJECTED",
    );
    expect(() => native.open(process.cwd(), "deny-create", "")).toThrow(
      "CREATE_FAILED",
    );
    const owner = native.open(process.cwd());
    try {
      expect(() => native.open(process.cwd())).toThrow("OWNER_BUSY");
    } finally {
      native.close(owner);
    }
  },
);

it.runIf(process.platform === "win32")(
  "bounds full-pipe writes and kills the stalled tree",
  async () => {
    const native = load();
    const owner = native.open(process.cwd());
    try {
      native.write(owner, Buffer.from("stall\n"));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const start = Date.now();
      expect(() => {
        for (let i = 0; i < 8; i++)
          native.write(owner, Buffer.alloc(65536, 65));
      }).toThrow("WRITE_TIMEOUT");
      expect(Date.now() - start).toBeLessThan(3000);
      expect(native.stop(owner)).toBe(true);
    } finally {
      native.close(owner);
    }
  },
);

it.runIf(process.platform === "win32")(
  "cleans descendants on root exit and rejects stale handles across rapid restarts",
  async () => {
    const native = load();
    let baseline = 0;
    for (let i = 0; i < 8; i++) {
      const owner = native.open(process.cwd());
      try {
        await expect
          .poll(() => native.snapshot(owner).active, { timeout: 3000 })
          .toBeGreaterThanOrEqual(3);
        const handles = native.snapshot(owner).handles;
        if (i === 0) baseline = handles;
        else expect(handles).toBeLessThanOrEqual(baseline + 2);
        native.write(owner, Buffer.from("partial\n"));
        await expect.poll(() => native.snapshot(owner).exited).toBe(true);
        expect(native.snapshot(owner).active).toBeGreaterThanOrEqual(2);
        expect(native.stop(owner)).toBe(true);
        expect(native.snapshot(owner).active).toBe(0);
        expect(() => native.write(owner, Buffer.from("x"))).toThrow(
          "PIPE_WRITE_FAILED",
        );
      } finally {
        native.close(owner);
      }
      expect(() => native.read(owner, false)).toThrow("OWNER_CLOSED");
    }
  },
);

it
  .runIf(process.platform === "win32")
  .each([
    "before-job",
    "after-job",
    "before-create",
    "created",
    "verified",
    "resumed",
    "pending-write",
  ])(
  "owner death at %s leaves no target alive",
  async (stage) => {
    const checkpoint = resolve(
      mkdtempSync(resolve(tmpdir(), "ak-stdio-")),
      "checkpoint",
    );
    const worker = fork(
      resolve("tests/fixtures/stdio-crash.cjs"),
      [stage, checkpoint],
      { execArgv: [], stdio: "ignore" },
    );
    try {
      await expect
        .poll(() => existsSync(checkpoint), { timeout: 10000 })
        .toBe(true);
      const members = JSON.parse(readFileSync(checkpoint, "utf8")) as number[];
      if (["created", "verified", "resumed", "pending-write"].includes(stage))
        expect(members.length).toBeGreaterThan(0);
      if (stage === "resumed") expect(members.length).toBeGreaterThanOrEqual(3);
      const exited = new Promise<void>((resolve) =>
        worker.once("exit", () => resolve()),
      );
      worker.kill();
      await exited;
      for (const pid of members)
        await expect
          .poll(
            () => {
              try {
                process.kill(pid, 0);
                return false;
              } catch {
                return true;
              }
            },
            { timeout: 5000 },
          )
          .toBe(true);
      console.log(
        JSON.stringify({ stage, members, worker: worker.pid, cleaned: true }),
      );
    } finally {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill();
    }
  },
  15000,
);

it.runIf(process.platform === "win32")(
  "failed cleanup reports uncertainty, poisons restart and still closes the job",
  async () => {
    const worker = fork(
      resolve("tests/fixtures/stdio-cleanup-failure.cjs"),
      [],
      { execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    try {
      const observed = await new Promise<{
        members: number[];
        cleaned: boolean;
        rejected: boolean;
      }>((resolve, reject) => {
        worker.once("message", (message) => resolve(message as never));
        worker.once("error", reject);
      });
      expect(observed.cleaned).toBe(false);
      expect(observed.rejected).toBe(true);
      expect(observed.members.length).toBeGreaterThanOrEqual(3);
      for (const pid of observed.members)
        await expect
          .poll(() => {
            try {
              process.kill(pid, 0);
              return false;
            } catch {
              return true;
            }
          })
          .toBe(true);
    } finally {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill();
    }
  },
);
