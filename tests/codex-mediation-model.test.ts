import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMediationModel } from "../scripts/codex-mediation-model";

const wire = readFileSync(
  new URL("./fixtures/codex-mediation/request.jsonl", import.meta.url),
  "utf8",
);
const request = JSON.parse(wire);
const context = {
  threadId: "thread-fixture",
  turnId: "turn-fixture",
  callId: "call-fixture",
  resourceId: "resource-fixture",
  expiresAt: 100,
  channelId: "channel-fixture",
};
const feed = (
  model: ReturnType<typeof createMediationModel>,
  value = wire,
  now = 1,
) => model.feed(Buffer.from(value), "channel-fixture", now);
const review = (
  model: ReturnType<typeof createMediationModel>,
  digest: string,
  now = 2,
) =>
  model.review(
    { requestId: 7, digest, decision: "approve-once" },
    "channel-fixture",
    now,
  );

describe("offline mediation design, never an execution permit", () => {
  it("accepts the same fixture with CRLF framing on Windows checkouts", () => {
    expect(
      feed(createMediationModel(context), wire.trimEnd() + "\r\n").decision,
    ).toBe("AWAITING_REVIEW");
  });
  it("waits for exact synthetic review, accepts once, never emits a provider response", () => {
    const model = createMediationModel(context);
    const pending = feed(model);
    expect(pending).toMatchObject({
      decision: "AWAITING_REVIEW",
      executionAllowed: false,
      liveExecution: false,
    });
    expect(pending.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(review(model, pending.digest!)).toMatchObject({
      decision: "MODEL_ACCEPT",
      executionAllowed: false,
    });
    expect(review(model, pending.digest!)).toMatchObject({ decision: "DENY" });
  });
  it("supports split JSONL bytes without authorizing partial frames", () => {
    const model = createMediationModel(context);
    expect(feed(model, wire.slice(0, 50)).decision).toBe("BUFFERING");
    expect(feed(model, wire.slice(50)).decision).toBe("AWAITING_REVIEW");
  });
  it.each([
    ["malformed", "{\n"],
    ["array", "[]\n"],
    ["null", "null\n"],
    [
      "unknown method",
      JSON.stringify({ ...request, method: "unknown/execute" }) + "\n",
    ],
    [
      "approval request",
      JSON.stringify({
        ...request,
        method: "item/commandExecution/requestApproval",
      }) + "\n",
    ],
    ["unsolicited response", '{"id":7,"result":{"decision":"accept"}}\n'],
    [
      "missing id",
      JSON.stringify({ method: request.method, params: request.params }) + "\n",
    ],
    ["unsafe integer", JSON.stringify({ ...request, id: 1e20 }) + "\n"],
    ["extra envelope", JSON.stringify({ ...request, approved: true }) + "\n"],
    [
      "unauthorized tool",
      JSON.stringify({
        ...request,
        params: { ...request.params, tool: "shell" },
      }) + "\n",
    ],
    [
      "namespace",
      JSON.stringify({
        ...request,
        params: { ...request.params, namespace: "other" },
      }) + "\n",
    ],
    [
      "wrong thread",
      JSON.stringify({
        ...request,
        params: { ...request.params, threadId: "other" },
      }) + "\n",
    ],
    [
      "wrong turn",
      JSON.stringify({
        ...request,
        params: { ...request.params, turnId: "other" },
      }) + "\n",
    ],
    [
      "wrong call",
      JSON.stringify({
        ...request,
        params: { ...request.params, callId: "other" },
      }) + "\n",
    ],
    [
      "scope escalation",
      JSON.stringify({
        ...request,
        params: {
          ...request.params,
          arguments: { resourceId: "outside", maxBytes: 32 },
        },
      }) + "\n",
    ],
    [
      "byte escalation",
      JSON.stringify({
        ...request,
        params: {
          ...request.params,
          arguments: { resourceId: context.resourceId, maxBytes: 33 },
        },
      }) + "\n",
    ],
    [
      "path injection",
      JSON.stringify({
        ...request,
        params: {
          ...request.params,
          arguments: {
            resourceId: context.resourceId,
            maxBytes: 32,
            path: "outside",
          },
        },
      }) + "\n",
    ],
    ["frame limit", "x".repeat(4097)],
    ["duplicate JSON keys", wire.replace('"id":7', '"id":8,"id":7')],
    ["unknown notification", '{"method":"future/event","params":{}}\n'],
    [
      "request disguised as notification",
      '{"id":7,"method":"item/started","params":{}}\n',
    ],
  ])("closes permanently on %s", (_name, input) => {
    const model = createMediationModel(context);
    expect(feed(model, input).decision).toBe("DENY");
    expect(feed(model).decision).toBe("DENY");
  });
  it("rejects invalid UTF-8", () => {
    expect(
      createMediationModel(context).feed(
        Buffer.from([255, 10]),
        context.channelId,
        1,
      ).decision,
    ).toBe("DENY");
  });
  it("rejects duplicate pending IDs and coalesced replay", () => {
    expect(feed(createMediationModel(context), wire + wire).decision).toBe(
      "DENY",
    );
  });
  it("rejects a second request with a different ID while review is pending", () => {
    const model = createMediationModel(context);
    feed(model);
    expect(
      feed(model, JSON.stringify({ ...request, id: 8 }) + "\n").decision,
    ).toBe("DENY");
  });
  it("rejects replay after consumption", () => {
    const model = createMediationModel(context);
    const pending = feed(model);
    review(model, pending.digest!);
    expect(feed(model).decision).toBe("DENY");
  });
  it("rejects approval before the request", () => {
    expect(review(createMediationModel(context), "a".repeat(64)).decision).toBe(
      "DENY",
    );
  });
  it.each([
    "item/started",
    "item/completed",
    "item/commandExecution/outputDelta",
    "item/mcpToolCall/progress",
    "hook/started",
  ])("%s is observation, never approval", (method) => {
    const model = createMediationModel(context);
    expect(
      feed(model, JSON.stringify({ method, params: {} }) + "\n"),
    ).toMatchObject({ decision: "OBSERVED", executionAllowed: false });
    expect(review(model, "a".repeat(64)).decision).toBe("DENY");
  });
  it("channel loss invalidates pending and partial data and rejects late approvals", () => {
    const model = createMediationModel(context);
    const pending = feed(model);
    model.close();
    expect(review(model, pending.digest!).decision).toBe("DENY");
    const partial = createMediationModel(context);
    feed(partial, wire.slice(0, 10));
    partial.close();
    expect(feed(partial, wire.slice(10)).decision).toBe("DENY");
  });
  it.each([100, 0, NaN])(
    "rejects expiry or invalid/rollback time %s",
    (now) => {
      const model = createMediationModel(context);
      const pending = feed(model);
      expect(review(model, pending.digest!, now).decision).toBe("DENY");
    },
  );
  it("missing review remains non-authorizing and expires", () => {
    const model = createMediationModel(context);
    feed(model);
    expect(feed(model, "", 99).decision).toBe("AWAITING_REVIEW");
    expect(feed(model, "", 100).decision).toBe("DENY");
  });
  it.each([
    { requestId: 8, digest: "a".repeat(64), decision: "approve-once" },
    { requestId: 7, digest: "a".repeat(64), decision: "approve-once" },
    { requestId: 7, digest: "a".repeat(64), decision: "acceptForSession" },
  ])("rejects mismatched or expanded review %#", (input) => {
    const model = createMediationModel(context);
    feed(model);
    expect(model.review(input, context.channelId, 2).decision).toBe("DENY");
  });
  it("rejects channel spoofing and does not echo content", () => {
    const model = createMediationModel(context);
    const result = model.feed(Buffer.from(wire), "other", 1);
    expect(result.decision).toBe("DENY");
    expect(JSON.stringify(result)).not.toContain("resource-fixture");
  });
  it("bounds notification floods", () => {
    const model = createMediationModel(context);
    const notification = '{"method":"item/started","params":{}}\n';
    for (let n = 0; n < 64; n++)
      expect(feed(model, notification).decision).toBe("OBSERVED");
    expect(feed(model, notification).decision).toBe("DENY");
  });
  it("refuses review while trailing data is incomplete", () => {
    const model = createMediationModel(context);
    const pending = feed(model, wire + "{");
    expect(review(model, pending.digest!).decision).toBe("DENY");
  });
  it("a notification cannot consume or replace pending review", () => {
    const model = createMediationModel(context);
    const pending = feed(model);
    expect(
      feed(model, '{"method":"item/completed","params":{}}\n').digest,
    ).toBe(pending.digest);
    expect(
      model.review(
        { requestId: 7, digest: pending.digest, decision: "approve-once" },
        "other",
        2,
      ).decision,
    ).toBe("DENY");
  });
});
