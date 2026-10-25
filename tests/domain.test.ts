import { describe, expect, it } from "vitest";
import { assertTransition } from "../packages/domain/src/index";
describe("task transitions", () => {
  it.each([
    ["draft", "ready"],
    ["ready", "running"],
    ["running", "awaiting_review"],
    ["awaiting_review", "succeeded"],
    ["running", "interrupted"],
    ["draft", "cancelled"],
  ])("permits %s → %s", (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });
  it.each([
    ["draft", "succeeded"],
    ["running", "succeeded"],
    ["cancelled", "running"],
    ["succeeded", "ready"],
    ["awaiting_review", "running"],
  ])("rejects %s → %s", (from, to) => {
    expect(() => assertTransition(from, to)).toThrow();
  });
});
