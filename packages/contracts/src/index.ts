import { z } from "zod";
export * from "./terminal";
export const PROTOCOL_VERSION = 1 as const;
export const MAX_FRAME_BYTES = 256 * 1024;
const id = z.string().min(1).max(100);
const title = z.string().trim().min(1).max(200);
export const taskStatusSchema = z.enum([
  "draft",
  "ready",
  "running",
  "awaiting_review",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const projectSchema = z
  .object({ id, name: title, createdAt: z.string() })
  .strict();
export const taskSchema = z
  .object({
    id,
    projectId: id,
    title,
    status: taskStatusSchema,
    revision: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
    runId: id.nullable(),
    result: z.string().max(64000).nullable(),
    resultHash: z.string().nullable(),
    executionMode: z.literal("mock"),
  })
  .strict();
export const eventSchema = z
  .object({
    sequence: z.number().int(),
    entityId: id,
    kind: z.string(),
    occurredAt: z.string(),
  })
  .strict();
export const snapshotSchema = z
  .object({
    mode: z.literal("mock"),
    projects: z.array(projectSchema),
    tasks: z.array(taskSchema),
    events: z.array(eventSchema),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type TaskEvent = z.infer<typeof eventSchema>;
const base = { version: z.literal(PROTOCOL_VERSION), requestId: id };
const ref = { taskId: id, revision: z.number().int().nonnegative() };
export const requestSchema = z.discriminatedUnion("method", [
  z
    .object({
      ...base,
      method: z.literal("snapshot"),
      payload: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal("project.create"),
      payload: z.object({ name: title }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal("task.create"),
      payload: z.object({ projectId: id, title }).strict(),
    })
    .strict(),
  ...(["task.ready", "task.run", "task.cancel"] as const).map((method) =>
    z
      .object({
        ...base,
        method: z.literal(method),
        payload: z.object(ref).strict(),
      })
      .strict(),
  ),
  z
    .object({
      ...base,
      method: z.literal("task.accept"),
      payload: z
        .object({ ...ref, resultHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict(),
    })
    .strict(),
]);
export type Request = z.infer<typeof requestSchema>;
type WithoutEnvelope<T> = T extends unknown
  ? Omit<T, "version" | "requestId">
  : never;
export type Command = WithoutEnvelope<Request>;
export const responseSchema = z.discriminatedUnion("ok", [
  z.object({ ...base, ok: z.literal(true), data: snapshotSchema }).strict(),
  z
    .object({
      ...base,
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum(["INVALID_REQUEST", "CONFLICT", "UNAVAILABLE"]),
          message: z.string().max(200),
        })
        .strict(),
    })
    .strict(),
]);
export type Response = z.infer<typeof responseSchema>;
export function parseRequest(input: unknown): Request {
  if (
    new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_FRAME_BYTES
  )
    throw new Error("İstek boyutu aşıldı.");
  return requestSchema.parse(input);
}
export interface DesktopApi {
  snapshot(): Promise<Snapshot>;
  createProject(name: string): Promise<Snapshot>;
  createTask(projectId: string, title: string): Promise<Snapshot>;
  ready(taskId: string, revision: number): Promise<Snapshot>;
  run(taskId: string, revision: number): Promise<Snapshot>;
  cancel(taskId: string, revision: number): Promise<Snapshot>;
  accept(
    taskId: string,
    revision: number,
    resultHash: string,
  ): Promise<Snapshot>;
}
