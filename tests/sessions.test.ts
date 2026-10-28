import { describe, expect, it } from "vitest";
import * as contracts from "../packages/contracts/src/index";

describe("sessions v1 boundary", () => {
  it("exposes a strict versioned contract without launch authority", () => {
    expect(contracts).toHaveProperty("sessionRequestSchema");
    const schema = contracts.sessionRequestSchema;
    const request = {
      protocol: "sessions",
      version: 1,
      requestId: "r",
      command: { method: "list", payload: {} },
    };
    expect(schema.safeParse(request).success).toBe(true);
    expect(schema.safeParse({ ...request, version: 2 }).success).toBe(false);
    for (const key of ["executable", "argv", "cwd", "env", "shell", "provider"])
      expect(
        schema.safeParse({
          ...request,
          command: {
            method: "start",
            payload: { projectId: "p", approved: true, [key]: "evil" },
          },
        }).success,
      ).toBe(false);
    expect(
      schema.safeParse({
        ...request,
        command: {
          method: "start",
          payload: { projectId: "p", approved: false },
        },
      }).success,
    ).toBe(false);
  });
});
