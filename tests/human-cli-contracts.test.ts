import { expect, it } from "vitest";
import * as contracts from "../packages/contracts/src";

it("separates human terminal consent from diagnostics and managed execution", () => {
  expect(contracts).toHaveProperty("humanCliRequestSchema");
  const schema = contracts.humanCliRequestSchema;
  const request = {
    protocol: "human-cli",
    version: 1,
    requestId: "r",
    command: {
      method: "prepare",
      payload: { integrationId: "claude-code", workspaceId: "w" },
    },
  };
  expect(schema.safeParse(request).success).toBe(true);
  for (const protocol of ["terminal", "sessions"])
    expect(schema.safeParse({ ...request, protocol }).success).toBe(false);
  expect(schema.safeParse({ ...request, version: 2 }).success).toBe(false);
  for (const key of [
    "path",
    "cwd",
    "argv",
    "env",
    "prompt",
    "liveExecution",
    "ownerId",
  ])
    expect(
      schema.safeParse({
        ...request,
        command: {
          ...request.command,
          payload: { ...request.command.payload, [key]: "injected" },
        },
      }).success,
    ).toBe(false);
  for (const method of ["start", "stop"]) {
    const payload = {
      sessionId: "00000000-0000-4000-8000-000000000000",
      approved: true,
      ...(method === "start"
        ? { approvalToken: "00000000-0000-4000-8000-000000000001" }
        : {}),
    };
    expect(
      schema.safeParse({ ...request, command: { method, payload } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...request,
        command: { method, payload: { ...payload, approved: false } },
      }).success,
    ).toBe(false);
  }
});
