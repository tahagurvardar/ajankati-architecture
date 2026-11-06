import { describe, expect, it } from "vitest";
import { createBrokerModel } from "../scripts/isolation-broker-model";

const grant = () => ({
  runId: "fixture-run",
  actionDigest: "a".repeat(64),
  channelId: "fixture-channel",
  resourceIds: ["approved-file"],
  issuedAt: 100,
  expiresAt: 200,
  byteBudget: 16,
});
const request = () => ({
  version: 1,
  operation: "read-resource",
  runId: "fixture-run",
  actionDigest: "a".repeat(64),
  sequence: 0,
  resourceId: "approved-file",
  maxBytes: 8,
});

describe("offline broker design model (no OS isolation or execution authority)", () => {
  it("accepts a bounded synthetic read and spends quota before delivery", () => {
    const broker = createBrokerModel(grant());
    expect(broker.review(request(), "fixture-channel", 101)).toEqual({
      decision: "MODEL_ACCEPT",
      executionAllowed: false,
    });
    expect(broker.review(request(), "fixture-channel", 102).decision).toBe(
      "DENY",
    );
    expect(
      broker.review({ ...request(), sequence: 1 }, "fixture-channel", 103)
        .decision,
    ).toBe("MODEL_ACCEPT");
    expect(
      broker.review(
        { ...request(), sequence: 2, maxBytes: 1 },
        "fixture-channel",
        104,
      ).decision,
    ).toBe("DENY");
  });
  it.each([
    { operation: "write-resource" },
    { operation: "spawn" },
    { operation: "connect" },
    { operation: "open-pipe" },
    { operation: "read-credential" },
    { resourceId: "outside-file" },
    { resourceId: "../outside" },
    { path: "C:\\outside.txt" },
    { capability: "network" },
    { runId: "other-run" },
    { actionDigest: "b".repeat(64) },
    { sequence: 1 },
    { maxBytes: 17 },
    { maxBytes: 0 },
    { maxBytes: 1.5 },
    { channelId: "fixture-channel" },
    { approved: true },
  ])("rejects an ungranted or malformed request: %j", (change) => {
    const broker = createBrokerModel(grant());
    expect(
      broker.review({ ...request(), ...change }, "fixture-channel", 101)
        .decision,
    ).toBe("DENY");
    expect(broker.review(request(), "fixture-channel", 102).decision).toBe(
      "MODEL_ACCEPT",
    );
  });
  it.each([99, 200, NaN, Infinity])(
    "rejects invalid/expired time %s",
    (now) => {
      expect(
        createBrokerModel(grant()).review(request(), "fixture-channel", now)
          .decision,
      ).toBe("DENY");
    },
  );
  it("rejects another transport even with a matching payload", () => {
    expect(
      createBrokerModel(grant()).review(request(), "other-channel", 101)
        .decision,
    ).toBe("DENY");
  });
  it("revokes on clock rollback and owner close; there is no resume", () => {
    const broker = createBrokerModel(grant());
    broker.review(request(), "fixture-channel", 110);
    expect(
      broker.review({ ...request(), sequence: 1 }, "fixture-channel", 109)
        .decision,
    ).toBe("DENY");
    expect(
      broker.review({ ...request(), sequence: 1 }, "fixture-channel", 111)
        .decision,
    ).toBe("DENY");
    const other = createBrokerModel(grant());
    other.close();
    expect(other.review(request(), "fixture-channel", 101).decision).toBe(
      "DENY",
    );
  });
  it("copies grants; caller mutation cannot add authority", () => {
    const input = grant();
    const broker = createBrokerModel(input);
    input.resourceIds.push("outside-file");
    input.byteBudget = 1000;
    expect(
      broker.review(
        { ...request(), resourceId: "outside-file" },
        "fixture-channel",
        101,
      ).decision,
    ).toBe("DENY");
    expect(
      broker.review({ ...request(), maxBytes: 17 }, "fixture-channel", 102)
        .decision,
    ).toBe("DENY");
  });
  it("rejects invalid grants before establishing a model", () => {
    expect(() => createBrokerModel({ ...grant(), expiresAt: 100 })).toThrow();
    expect(() => createBrokerModel({ ...grant(), byteBudget: -1 })).toThrow();
  });
});
