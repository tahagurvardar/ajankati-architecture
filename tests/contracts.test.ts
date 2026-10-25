import { describe, expect, it } from "vitest";
import { parseRequest, responseSchema } from "../packages/contracts/src/index";
const request = {
  version: 1,
  requestId: "request-1",
  method: "task.create",
  payload: { projectId: "project-1", title: "İlk görev" },
};
describe("versioned boundary validation", () => {
  it("accepts a bounded Turkish task request", () => {
    expect(parseRequest(request)).toEqual(request);
  });
  it.each([
    { ...request, version: 2 },
    { ...request, method: "shell.exec" },
    { ...request, payload: { ...request.payload, root: "/etc" } },
    { ...request, payload: { ...request.payload, title: " " } },
    { ...request, payload: { ...request.payload, title: "x".repeat(1001) } },
    { ...request, requestId: "" },
  ])("rejects unknown authority, versions and malformed data", (input) => {
    expect(() => parseRequest(input)).toThrow();
  });
  it("rejects a malformed response before it reaches the UI", () => {
    expect(
      responseSchema.safeParse({
        version: 1,
        requestId: "r",
        ok: true,
        data: { mode: "real" },
      }).success,
    ).toBe(false);
  });
});
