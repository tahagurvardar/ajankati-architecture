import { z } from "zod";

export const integrationIdSchema = z.enum(["claude-code", "codex-cli"]);
export type IntegrationId = z.infer<typeof integrationIdSchema>;
const capability = z.enum(["verified", "unknown", "unsupported"]);
export const executableIdentitySchema = z
  .object({
    path: z.string().max(4096),
    kind: z.enum(["exe", "npm-native", "cmd"]),
    sourcePath: z.string().max(4096),
    sourceCanonicalPath: z.string().max(4096),
    fingerprint: z.string().max(200),
    sourceFingerprint: z.string().max(200),
  })
  .strict();
export const agentRecordSchema = z
  .object({
    integrationId: integrationIdSchema,
    provider: z.enum(["Claude Code", "Codex CLI"]),
    executable: executableIdentitySchema.nullable(),
    detectedVersion: z.string().max(100).nullable(),
    discovered: z.boolean(),
    verified: z.boolean(),
    enabled: z.literal(false),
    approvalToken: z.string().uuid().nullable(),
    lastVerificationAt: z.string().datetime().nullable(),
    compatibilityEvidence: z
      .array(
        z
          .object({
            source: z.literal("local-version-probe-v1"),
            observedAt: z.string().datetime(),
            platform: z.string().max(100),
            version: z.string().max(100),
            fingerprint: z.string().max(200),
          })
          .strict(),
      )
      .max(1),
    capabilities: z
      .object({
        versionCheck: capability,
        pty: capability,
        processOwnership: capability,
        permissions: capability,
        cancellation: capability,
        sandbox: capability,
        structuredEvents: capability,
        managedTasks: capability,
      })
      .strict(),
    error: z
      .object({ code: z.string().max(60), message: z.string().max(250) })
      .strict()
      .nullable(),
  })
  .strict();
export type AgentRecord = z.infer<typeof agentRecordSchema>;
export const agentStateSchema = z
  .object({ integrations: z.array(agentRecordSchema).max(2) })
  .strict();
export type AgentState = z.infer<typeof agentStateSchema>;
export const agentCommandSchema = z.discriminatedUnion("method", [
  z
    .object({ method: z.literal("list"), payload: z.object({}).strict() })
    .strict(),
  z
    .object({ method: z.literal("discover"), payload: z.object({}).strict() })
    .strict(),
  z
    .object({
      method: z.literal("verify"),
      payload: z
        .object({
          integrationId: integrationIdSchema,
          approvalToken: z.string().uuid(),
          approved: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);
export type AgentCommand = z.infer<typeof agentCommandSchema>;
const envelope = {
  protocol: z.literal("agents"),
  version: z.literal(1),
  requestId: z.string().min(1).max(100),
};
export const agentRequestSchema = z
  .object({ ...envelope, command: agentCommandSchema })
  .strict();
export const agentResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({ ...envelope, ok: z.literal(true), data: agentStateSchema })
    .strict(),
  z
    .object({ ...envelope, ok: z.literal(false), error: z.string().max(200) })
    .strict(),
]);
export interface AgentApi {
  list(): Promise<AgentState>;
  discover(): Promise<AgentState>;
  verify(
    integrationId: IntegrationId,
    approvalToken: string,
  ): Promise<AgentState>;
}
