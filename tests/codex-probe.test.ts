import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transform } from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";

describe.runIf(process.platform === "win32")(
  "offline Codex probe preparation",
  () => {
    const pin =
      "6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36";
    const fixture = Buffer.from("offline pinned executable fixture");
    const fixtureHash = crypto
      .createHash("sha256")
      .update(fixture)
      .digest("hex");
    let code: string;
    let directory: string;
    let root: string;
    let source: string;
    let globalSource: string;

    beforeAll(async () => {
      // Execute the actual operator script with a closed module allowlist. No native
      // module, child process, real home directory or provider binary is accessible.
      const script = fs.readFileSync("scripts/codex-probe.ts", "utf8");
      code = (
        await transform(
          script.replace(
            "void main().catch",
            "globalThis.completion = main().catch",
          ),
          {
            loader: "ts",
            format: "cjs",
            target: "node24",
          },
        )
      ).code;
    });

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(tmpdir(), "ak-probe-source-"));
      root = path.join(directory, "dist");
      fs.mkdirSync(root);
      source = path.join(directory, "preserved codex.exe");
      fs.writeFileSync(source, fixture);
      globalSource = path.join(
        directory,
        "AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
      );
      fs.mkdirSync(path.dirname(globalSource), { recursive: true });
      fs.writeFileSync(globalSource, "different global version");
    });

    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    async function run(args: string[], corruptCopy = false) {
      const errors: string[] = [];
      const output: string[] = [];
      const reads: string[] = [];
      const forbidden: string[] = [];
      const fakeProcess = {
        platform: "win32",
        arch: "x64",
        argv: ["node", "probe.cjs", ...args],
        exitCode: 0,
      };
      const context = {
        __dirname: root,
        process: fakeProcess,
        console: {
          log: (value: string) => output.push(value),
          error: (value: string) => errors.push(value),
        },
        require: (id: string): unknown => {
          if (id === "node:path") return path.win32;
          if (id === "node:os") return { homedir: () => directory };
          if (id === "node:crypto")
            return {
              ...crypto,
              // Only the inert fixture's actual digest is mapped to the production pin.
              // No production hash override or executable fixture is introduced.
              createHash: (algorithm: string) => {
                const hash = crypto.createHash(algorithm);
                return {
                  update: (chunk: Buffer) => hash.update(chunk),
                  digest: () => {
                    const value = hash.digest("hex");
                    return value === fixtureHash ? pin : value;
                  },
                };
              },
            };
          if (id === "node:fs")
            return {
              ...fs,
              lstatSync: (file: string) => {
                // Isolate ancestor policy checks from the machine's real configuration.
                if (path.basename(file) === ".codex")
                  throw Object.assign(new Error(), { code: "ENOENT" });
                return fs.lstatSync(file);
              },
              createReadStream: (file: string) => {
                reads.push(file);
                return fs.createReadStream(file);
              },
              copyFileSync: (from: string, to: string, flags: number) => {
                fs.copyFileSync(from, to, flags);
                if (corruptCopy) fs.writeFileSync(to, "corrupted copy");
              },
            };
          // Imports are inert; any attempt to enter ledger/handshake/native code fails.
          if (id.startsWith("../"))
            return new Proxy(
              {},
              {
                get: (_target, key) => {
                  forbidden.push(String(key));
                  throw new Error("FORBIDDEN_PROBE_OPERATION");
                },
              },
            );
          throw new Error(`Unexpected import: ${id}`);
        },
        completion: undefined as Promise<void> | undefined,
      };
      runInNewContext(code, context);
      await context.completion;
      expect(forbidden).toEqual([]);
      expect(fs.existsSync(path.join(root, "codex-probe.lock"))).toBe(false);
      expect(fs.existsSync(path.join(root, "codex-probe-ledger.sqlite"))).toBe(
        false,
      );
      return { errors, output, reads, exitCode: fakeProcess.exitCode };
    }

    function expectUnprepared() {
      expect(fs.readdirSync(root)).toEqual([]);
    }

    it("prepares from an explicit pinned source despite a different global version", async () => {
      const result = await run(["--prepare", "--source-executable", source]);
      expect(result.exitCode).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.reads).toEqual([source, path.join(root, "codex.exe")]);
      expect(fs.readFileSync(path.join(root, "codex.exe"))).toEqual(fixture);
      const plan = JSON.parse(
        fs.readFileSync(path.join(root, "codex-probe-plan.json"), "utf8"),
      );
      expect(plan).toMatchObject({
        sha256: pin,
        version: "0.164.0",
        used: false,
        methods: ["initialize", "initialized"],
      });
      expect(JSON.parse(result.output[0])).toMatchObject({
        prepared: true,
        inference: false,
        credentials: "none",
      });
      expect(fs.readdirSync(plan.profile)).toEqual(["config.toml"]);
      const repeat = await run(["--prepare", "--source-executable", source]);
      expect(repeat.errors).toEqual(["PROBE_PLAN_ALREADY_EXISTS"]);
      expect(repeat.reads).toEqual([]);
    });

    it("keeps the global source as the default and rejects its wrong identity", async () => {
      expect((await run(["--prepare"])).errors).toEqual(["IDENTITY_REJECTED"]);
      expectUnprepared();
      fs.writeFileSync(globalSource, fixture);
      const result = await run(["--prepare"]);
      expect(result.exitCode).toBe(0);
      expect(result.reads).toEqual([
        globalSource,
        path.join(root, "codex.exe"),
      ]);
    });

    it.each([
      "relative.exe",
      "C:relative.exe",
      "\\root-relative.exe",
      "",
      "https://example.com/codex.exe",
    ])("rejects non-absolute source %j", async (value) => {
      expect(
        (await run(["--prepare", "--source-executable", value])).errors,
      ).toEqual(["INVALID_SOURCE_EXECUTABLE"]);
      expectUnprepared();
    });

    it.each(["missing.exe", "directory.exe", "script.cmd", "link.exe"])(
      "rejects invalid file %s before hashing",
      async (name) => {
        const file = path.join(directory, name);
        if (name === "directory.exe") fs.mkdirSync(file);
        if (name === "script.cmd") fs.writeFileSync(file, fixture);
        if (name === "link.exe") fs.symlinkSync(root, file, "junction");
        const result = await run(["--prepare", "--source-executable", file]);
        expect(result.errors).toEqual(["INVALID_SOURCE_EXECUTABLE"]);
        expect(result.reads).toEqual([]);
        expectUnprepared();
      },
    );

    it("rejects a wrong source hash before copying even when global identity matches", async () => {
      fs.writeFileSync(globalSource, fixture);
      fs.writeFileSync(source, "wrong version");
      const result = await run(["--prepare", "--source-executable", source]);
      expect(result.errors).toEqual(["IDENTITY_REJECTED"]);
      expect(result.reads).toEqual([source]);
      expectUnprepared();
    });

    it.each([false, true])(
      "rejects a bad destination hash (corrupt copy: %s)",
      async (corruptCopy) => {
        if (!corruptCopy)
          fs.writeFileSync(path.join(root, "codex.exe"), "stale image");
        const result = await run(
          ["--prepare", "--source-executable", source],
          corruptCopy,
        );
        expect(result.errors).toEqual(["IDENTITY_REJECTED"]);
        expect(result.reads).toEqual([source, path.join(root, "codex.exe")]);
        expect(fs.readdirSync(root)).toEqual(["codex.exe"]);
      },
    );

    it.each([
      [],
      ["--source-executable", "C:\\codex.exe"],
      ["--prepare", "--source-executable"],
      ["--prepare", "--unknown", "C:\\codex.exe"],
      [
        "--prepare",
        "--source-executable",
        "C:\\codex.exe",
        "--source-executable",
        "C:\\other.exe",
      ],
      ["--approve-initialize-only", "--source-executable", "C:\\codex.exe"],
      ["--approve-initialize-only", "--prepare"],
    ])(
      "rejects malformed or approval-mode source arguments %j",
      async (...args) => {
        const result = await run(args);
        expect(result.exitCode).toBe(1);
        expect(result.errors).toEqual(["PROBE_FAILED"]);
        expect(result.reads).toEqual([]);
        expectUnprepared();
      },
    );
  },
);
