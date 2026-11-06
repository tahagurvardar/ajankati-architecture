import { z } from "zod";

// Diagnostic evidence only. V1 deliberately cannot represent a verified sandbox
// or grant authority. A future verifier needs a new reviewed contract version.
export const windowsSandboxScenarioSchema = z.enum([
  "approved-read",
  "outside-read",
  "traversal-read",
  "junction-read",
  "write",
  "delete",
  "rename",
  "replace",
  "child-read",
  "breakaway",
  "loopback",
]);
export const windowsSandboxEvidenceSchema = z
  .object({
    version: z.literal(1),
    mechanism: z.literal("restricted-token-job-v1"),
    platform: z.literal("win32"),
    osRelease: z.string().min(1).max(128),
    architecture: z.literal("x64"),
    fixtureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    collectedAt: z.number().int().nonnegative().safe(),
    executionAllowed: z.literal(false),
    liveExecution: z.literal(false),
    capabilities: z
      .object({
        filesystem: z.literal("UNKNOWN"),
        network: z.literal("UNKNOWN"),
        childIsolation: z.literal("UNKNOWN"),
      })
      .strict()
      .readonly(),
    observations: z
      .array(
        z
          .object({
            scenario: windowsSandboxScenarioSchema,
            boundaryContext: z.enum(["none", "native-lease-held"]),
            outcome: z.enum(["ALLOWED", "DENIED", "ERROR"]),
            win32Error: z.number().int().min(0).max(0xffffffff),
          })
          .strict()
          .refine((o) =>
            o.outcome === "ALLOWED"
              ? o.win32Error === 0
              : o.outcome === "DENIED"
                ? [5, 32].includes(o.win32Error)
                : o.win32Error !== 0 && ![5, 32].includes(o.win32Error),
          )
          .readonly(),
      )
      .min(1)
      .max(64)
      .readonly(),
  })
  .strict()
  .readonly();
export type WindowsSandboxEvidence = z.infer<
  typeof windowsSandboxEvidenceSchema
>;
