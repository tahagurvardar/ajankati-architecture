import { z } from "zod";

export const MANAGED_POLICY = "offline-read-only-v1" as const;
export const MAX_PLAN_TTL_MS = 5 * 60_000;
const id = z.string().min(1).max(100);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().safe();
const forbidden =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)|^(?:\.codex|\.claude|\.ssh|\.aws|\.env|\.git)(?:\.|$)/i;
function segment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[<>:"|?*\\/]/.test(value) &&
    ![...value].some((char) => char.charCodeAt(0) < 32) &&
    !/[. ]$/.test(value) &&
    !forbidden.test(value) &&
    value === value.normalize("NFC")
  );
}
export const managedRelativePathSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((value) => value.split("/").every(segment), "Unsafe relative path");
export const managedWindowsPathSchema = z
  .string()
  .max(4000)
  .refine(
    (value) =>
      /^[A-Za-z]:\\[^\\]/.test(value) &&
      value.slice(3).split("\\").every(segment),
    "Unsafe Windows path",
  );
const identity = z
  .object({
    path: managedWindowsPathSchema,
    device: id,
    fileId: id,
    birthtimeNs: id,
  })
  .strict()
  .readonly();
export const managedPlanBodySchema = z
  .object({
    version: z.literal(1),
    planId: id,
    projectId: id,
    taskId: id,
    taskRevision: z.number().int().nonnegative().safe(),
    taskDigest: digest,
    runId: id,
    runRevision: z.literal(0),
    executable: identity
      .unwrap()
      .extend({ sha256: digest })
      .strict()
      .readonly(),
    workspace: identity
      .unwrap()
      .extend({ contentDigest: digest })
      .strict()
      .readonly(),
    scope: z
      .array(managedRelativePathSchema)
      .min(1)
      .max(64)
      .refine(
        (paths) =>
          new Set(paths.map((p) => p.toLowerCase())).size === paths.length,
      )
      .readonly(),
    allowedOperations: z.tuple([z.literal("read-file")]).readonly(),
    policyVersion: z.literal(MANAGED_POLICY),
    createdAt: time,
    expiresAt: time,
  })
  .strict()
  .refine(
    (p) =>
      p.expiresAt > p.createdAt && p.expiresAt - p.createdAt <= MAX_PLAN_TTL_MS,
  );
export const managedPlanSchema = managedPlanBodySchema
  .safeExtend({ actionDigest: digest })
  .readonly();
export type ManagedPlan = z.infer<typeof managedPlanSchema>;
export const managedDecisionSchema = z
  .object({
    approvalId: id,
    planId: id,
    actionDigest: digest,
    runId: id,
    policyVersion: z.literal(MANAGED_POLICY),
    expiresAt: time,
    decidedAt: time,
    actor: id,
    decision: z.enum(["approve-once", "deny"]),
  })
  .strict();
export type ManagedDecision = z.infer<typeof managedDecisionSchema>;
export const gateSchema = z.enum(["verified", "failed", "unknown"]);
export const managedPreflightStatusSchema = z
  .object({
    executionAllowed: z.literal(false),
    gates: z
      .object({
        plan: gateSchema,
        task: gateSchema,
        executable: gateSchema,
        workspace: gateSchema,
        approval: gateSchema,
        ownership: gateSchema,
        validity: gateSchema,
        providerCompatibility: gateSchema,
        nativePathBoundary: gateSchema,
        sandboxFilesystem: gateSchema,
        sandboxNetwork: gateSchema,
        toolGate: gateSchema,
        sessionIsolation: gateSchema,
        processOwnership: gateSchema,
        humanApprovalChannel: gateSchema,
        liveExecution: z.literal("failed"),
      })
      .strict(),
  })
  .strict();
export type ManagedPreflightStatus = z.infer<
  typeof managedPreflightStatusSchema
>;
