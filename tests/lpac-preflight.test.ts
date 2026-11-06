import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const run = promisify(execFile);
const executable = resolve(
  "apps/worker/native/build/Release/lpac_preflight.exe",
);
const options = {
  windowsHide: true,
  timeout: 5000,
  maxBuffer: 4096,
  env: { SystemRoot: process.env.SystemRoot },
};
// Diagnostic output cannot express a successful sandbox or authorize execution.
const reportSchema = z.strictObject({
  version: z.literal(1),
  mode: z.literal("inspect-only"),
  decision: z.literal("NO-GO"),
  executionAllowed: z.literal(false),
  liveExecution: z.literal(false),
  tokenElevated: z.boolean(),
  callerAppContainer: z.boolean(),
  totalPhysicalBytes: z.number().int().positive(),
  availablePhysicalBytes: z.number().int().nonnegative(),
  memoryBudgetMet: z.boolean(),
  sidDerived: z.literal(true),
  securityCapabilitiesAttributeError: z.number().int().nonnegative(),
  lpacAttributeError: z.number().int().nonnegative(),
  profilelessRuntime: z.literal("UNKNOWN"),
  lpacIdentity: z.literal("UNKNOWN"),
  runtimeCleanup: z.literal("UNKNOWN"),
});

describe.runIf(process.platform === "win32")(
  "LPAC inspect-only preflight",
  () => {
    it("queries real APIs without promoting attribute acceptance to runtime proof", async () => {
      const { stdout, stderr } = await run(executable, ["--inspect"], options);
      expect(stderr).toBe("");
      const report = reportSchema.parse(JSON.parse(stdout));
      expect(report.availablePhysicalBytes).toBeLessThanOrEqual(
        report.totalPhysicalBytes,
      );
      expect(report.memoryBudgetMet).toBe(
        report.availablePhysicalBytes >= 2 * 1024 ** 3,
      );
      // Unsupported attributes are explicit failures, never silently skipped.
      expect(report.securityCapabilitiesAttributeError).toBe(0);
      expect(report.lpacAttributeError).toBe(0);
      console.log(JSON.stringify(report));
    });

    it.each(
      [
        [],
        ["--launch"],
        ["--inspect", "--launch"],
        ["--create-profile"],
        ["--allow-network"],
        ["--inspect", "C:\\synthetic-only"],
        ["--inspect", "--approve"],
      ].map((args) => ({ args })),
    )("rejects unsupported invocation $args", async ({ args }) => {
      await expect(run(executable, args, options)).rejects.toMatchObject({
        code: 2,
        stdout: "",
        stderr: "",
      });
    });

    it("remains diagnostic on repeated inspection", async () => {
      for (let index = 0; index < 2; index++) {
        const { stdout } = await run(executable, ["--inspect"], options);
        expect(reportSchema.parse(JSON.parse(stdout)).executionAllowed).toBe(
          false,
        );
      }
    });

    it("is built only as a test helper and is absent from worker distribution", () => {
      expect(existsSync(executable)).toBe(true);
      expect(existsSync(resolve("apps/worker/dist/lpac_preflight.exe"))).toBe(
        false,
      );
    });
  },
);
