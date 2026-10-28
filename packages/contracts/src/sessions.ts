import { z } from "zod";

const id = z.string().min(1).max(100);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const sessionStatusSchema = z.enum([
  "starting",
  "running",
  "awaiting_approval",
  "stopping",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export const sessionUsageSchema = z
  .object({
    sessionId: id,
    runId: id,
    projectId: id,
    provider: z.literal("codex"),
    source: z.enum(["codex-app-server", "fixture"]),
    cliVersion: z.string().max(100),
    cliIdentity: z.string().max(200),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    durationMs: count.nullable(),
    status: sessionStatusSchema,
    retryCount: z.literal(0),
    threadId: id.nullable(),
    turnId: id.nullable(),
    totalTokens: count.nullable(),
    tokenSource: z
      .literal("thread/tokenUsage/updated.total.totalTokens")
      .nullable(),
    cost: z.literal("UNKNOWN"),
    quota: z.literal("UNKNOWN"),
    reason: z.enum([
      "NONE",
      "PROTOCOL_ERROR",
      "PROVIDER_FAILED",
      "APPROVAL_REQUIRED",
      "TIMEOUT",
      "USER_CANCELLED",
      "PROCESS_EXIT",
      "WORKER_RESTART",
      "CLEANUP_UNCONFIRMED",
      "SHUTDOWN",
    ]),
  })
  .strict();
export type SessionUsage = z.infer<typeof sessionUsageSchema>;
export const sessionStateSchema = z
  .object({
    capability: z
      .object({
        provider: z.literal("codex"),
        liveLaunch: z.literal(false),
        protocol: z.literal("app-server/stdio"),
        blockers: z.array(z.string().max(250)).min(1).max(8),
      })
      .strict(),
    sessions: z.array(sessionUsageSchema).max(100),
  })
  .strict();
export type SessionState = z.infer<typeof sessionStateSchema>;
export const sessionCommandSchema = z.discriminatedUnion("method", [
  z
    .object({ method: z.literal("list"), payload: z.object({}).strict() })
    .strict(),
  z
    .object({
      method: z.literal("start"),
      payload: z.object({ projectId: id, approved: z.literal(true) }).strict(),
    })
    .strict(),
  ...(["interrupt", "terminate"] as const).map((method) =>
    z
      .object({
        method: z.literal(method),
        payload: z.object({ sessionId: id }).strict(),
      })
      .strict(),
  ),
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;
const envelope = {
  protocol: z.literal("sessions"),
  version: z.literal(1),
  requestId: id,
};
export const sessionRequestSchema = z
  .object({ ...envelope, command: sessionCommandSchema })
  .strict();
export const sessionResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({ ...envelope, ok: z.literal(true), data: sessionStateSchema })
    .strict(),
  z
    .object({ ...envelope, ok: z.literal(false), error: z.string().max(200) })
    .strict(),
]);
export interface SessionApi {
  list(): Promise<SessionState>;
  start(projectId: string, approved: true): Promise<SessionState>;
  interrupt(sessionId: string): Promise<SessionState>;
  terminate(sessionId: string): Promise<SessionState>;
}
