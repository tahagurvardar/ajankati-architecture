import { z } from "zod";
import { integrationIdSchema, executableIdentitySchema } from "./agents";

const sessionId = z.string().uuid();
export const humanCliCommandSchema = z.discriminatedUnion("method", [
  z
    .object({ method: z.literal("list"), payload: z.object({}).strict() })
    .strict(),
  z
    .object({
      method: z.literal("prepare"),
      payload: z
        .object({
          integrationId: integrationIdSchema,
          workspaceId: z.string().min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("start"),
      payload: z
        .object({
          sessionId,
          approvalToken: z.string().uuid(),
          approved: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("stop"),
      payload: z
        .object({
          sessionId,
          approved: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);
const envelope = {
  protocol: z.literal("human-cli"),
  version: z.literal(1),
  requestId: z.string().min(1).max(100),
};
export const humanCliRequestSchema = z
  .object({
    ...envelope,
    command: humanCliCommandSchema,
  })
  .strict();
export const humanCliStateSchema = z
  .object({
    mode: z.literal("human-controlled"),
    liveLaunch: z.literal(false),
    managedExecution: z.literal(false),
    session: z
      .object({
        sessionId,
        integrationId: integrationIdSchema,
        workspaceId: z.string().min(1).max(100),
        workspacePath: z.string().max(4096),
        executable: executableIdentitySchema,
        status: z.enum(["prepared", "blocked", "stopped", "expired"]),
        approvalToken: z.string().uuid().nullable(),
        expiresAt: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type HumanCliState = z.infer<typeof humanCliStateSchema>;
export const humanCliResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({ ...envelope, ok: z.literal(true), data: humanCliStateSchema })
    .strict(),
  z
    .object({ ...envelope, ok: z.literal(false), error: z.string().max(200) })
    .strict(),
]);
