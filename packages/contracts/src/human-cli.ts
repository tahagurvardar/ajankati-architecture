import { z } from "zod";
import { integrationIdSchema, executableIdentitySchema } from "./agents";
import { managedWindowsPathSchema } from "./managed-task";

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
// Only the inherited main-to-worker IPC can register paths or submit consent.
// Never use this schema for renderer messages.
export const humanCliWorkerCommandSchema = z.union([
  humanCliCommandSchema,
  z
    .object({
      method: z.literal("register-workspace"),
      payload: z.object({ path: managedWindowsPathSchema }).strict(),
    })
    .strict(),
]);
export type HumanCliWorkerCommand = z.infer<typeof humanCliWorkerCommandSchema>;
export const humanCliDesktopCommandSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("select-workspace"),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({ method: z.literal("list"), payload: z.object({}).strict() })
    .strict(),
  z
    .object({
      method: z.literal("prepare"),
      payload: z
        .object({
          integrationId: integrationIdSchema,
          workspaceId: z.string().uuid(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("approve"),
      payload: z.object({ sessionId }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("stop"),
      payload: z.object({ sessionId }).strict(),
    })
    .strict(),
]);
export type HumanCliDesktopCommand = z.infer<
  typeof humanCliDesktopCommandSchema
>;
export const humanCliRequestSchema = z
  .object({
    ...envelope,
    command: humanCliWorkerCommandSchema,
  })
  .strict();
export const humanCliStateSchema = z
  .object({
    mode: z.literal("human-controlled"),
    liveLaunch: z.literal(false),
    managedExecution: z.literal(false),
    workspaces: z
      .array(
        z
          .object({
            workspaceId: z.string().uuid(),
            path: z.string().max(4096),
          })
          .strict(),
      )
      .max(16),
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
export type HumanCliDesktopState = Omit<HumanCliState, "session"> & {
  session: Omit<NonNullable<HumanCliState["session"]>, "approvalToken"> | null;
};
export interface HumanCliApi {
  list(): Promise<HumanCliDesktopState | null>;
  selectWorkspace(): Promise<HumanCliDesktopState | null>;
  prepare(
    integrationId: "claude-code" | "codex-cli",
    workspaceId: string,
  ): Promise<HumanCliDesktopState | null>;
  approve(sessionId: string): Promise<HumanCliDesktopState | null>;
  stop(sessionId: string): Promise<HumanCliDesktopState | null>;
}
export const humanCliResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({ ...envelope, ok: z.literal(true), data: humanCliStateSchema })
    .strict(),
  z
    .object({ ...envelope, ok: z.literal(false), error: z.string().max(200) })
    .strict(),
]);
