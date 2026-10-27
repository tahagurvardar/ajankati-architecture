import { expect, it } from "vitest";
import * as contracts from "../packages/contracts/src/index";

it("exposes a separate versioned, strictly allowlisted terminal protocol", () => {
  expect(contracts).toHaveProperty("terminalRequestSchema");
});

it("rejects executable, path, environment, extra fields, bad dimensions and protocol versions", () => {
  const valid = {
    protocol: "terminal",
    version: 1,
    requestId: "test",
    command: {
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    },
  };
  expect(contracts.terminalRequestSchema.safeParse(valid).success).toBe(true);
  for (const extra of [
    { executable: "cmd.exe" },
    { cwd: "C:\\" },
    { env: {} },
    { profile: "powershell" },
    { cols: 0 },
    { rows: 101 },
  ]) {
    expect(
      contracts.terminalRequestSchema.safeParse({
        ...valid,
        command: {
          ...valid.command,
          payload: { ...valid.command.payload, ...extra },
        },
      }).success,
    ).toBe(false);
  }
  expect(
    contracts.terminalRequestSchema.safeParse({ ...valid, version: 2 }).success,
  ).toBe(false);
  expect(
    contracts.terminalCommandSchema.safeParse({
      method: "input",
      payload: {
        sessionId: "00000000-0000-4000-8000-000000000000",
        data: "x".repeat(4097),
      },
    }).success,
  ).toBe(false);
});
