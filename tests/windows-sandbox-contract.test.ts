import { expect, it } from "vitest";
import { windowsSandboxEvidenceSchema } from "../packages/contracts/src/windows-sandbox";

const evidence = {
  version: 1,
  mechanism: "restricted-token-job-v1",
  platform: "win32",
  osRelease: "10.0.26100",
  architecture: "x64",
  fixtureSha256: "a".repeat(64),
  collectedAt: 1,
  executionAllowed: false,
  liveExecution: false,
  capabilities: {
    filesystem: "UNKNOWN",
    network: "UNKNOWN",
    childIsolation: "UNKNOWN",
  },
  observations: [
    {
      scenario: "outside-read",
      boundaryContext: "none",
      outcome: "ALLOWED",
      win32Error: 0,
    },
  ],
};
it("keeps negative evidence immutable and separate from execution authorization", () => {
  const result = windowsSandboxEvidenceSchema.parse(evidence);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.observations[0])).toBe(true);
  expect(Object.isFrozen(result.capabilities)).toBe(true);
  expect(result.executionAllowed).toBe(false);
});
it("rejects claimed verification, permission, unknown fields and malformed observations", () => {
  for (const input of [
    { ...evidence, executionAllowed: true },
    { ...evidence, liveExecution: true },
    { ...evidence, version: 2 },
    {
      ...evidence,
      capabilities: { ...evidence.capabilities, filesystem: "VERIFIED" },
    },
    { ...evidence, approval: true },
    {
      ...evidence,
      observations: [
        { ...evidence.observations[0], outcome: "DENIED", win32Error: 0 },
      ],
    },
    {
      ...evidence,
      observations: [
        { ...evidence.observations[0], outcome: "ALLOWED", win32Error: 5 },
      ],
    },
  ])
    expect(windowsSandboxEvidenceSchema.safeParse(input).success).toBe(false);
});
it("does not classify missing files, connection refusal or process errors as isolation", () => {
  for (const win32Error of [2, 10061, 3221225506]) {
    const observations = [
      { ...evidence.observations[0], outcome: "ERROR", win32Error },
    ];
    expect(
      windowsSandboxEvidenceSchema.parse({ ...evidence, observations })
        .observations[0].outcome,
    ).toBe("ERROR");
    expect(
      windowsSandboxEvidenceSchema.safeParse({
        ...evidence,
        observations: [{ ...observations[0], outcome: "DENIED" }],
      }).success,
    ).toBe(false);
  }
});
