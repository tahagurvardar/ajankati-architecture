import { z } from "zod";

export const TERMINAL_VERSION = 1 as const;
const sessionId = z.string().uuid();
const size = {
  cols: z.number().int().min(20).max(300),
  rows: z.number().int().min(5).max(100),
};
const envelope = {
  protocol: z.literal("terminal"),
  version: z.literal(TERMINAL_VERSION),
  requestId: z.string().min(1).max(100),
};
export const terminalCommandSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("start"),
      payload: z.object({ profile: z.literal("safe-echo"), ...size }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("input"),
      payload: z
        .object({ sessionId, data: z.string().min(1).max(4096) })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("read"),
      payload: z
        .object({
          sessionId,
          cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("resize"),
      payload: z.object({ sessionId, ...size }).strict(),
    })
    .strict(),
  ...(["interrupt", "close"] as const).map((method) =>
    z
      .object({
        method: z.literal(method),
        payload: z.object({ sessionId }).strict(),
      })
      .strict(),
  ),
]);
export const terminalRequestSchema = z
  .object({ ...envelope, command: terminalCommandSchema })
  .strict();
export const terminalStateSchema = z
  .object({
    sessionId,
    pid: z.number().int().positive(),
    status: z.enum(["running", "exited"]),
    output: z.string().max(8192),
    cursor: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    exitCode: z.number().int().nullable(),
  })
  .strict();
export const terminalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({ ...envelope, ok: z.literal(true), data: terminalStateSchema })
    .strict(),
  z
    .object({ ...envelope, ok: z.literal(false), error: z.string().max(200) })
    .strict(),
]);
export type TerminalCommand = z.infer<typeof terminalCommandSchema>;
export type TerminalState = z.infer<typeof terminalStateSchema>;
export type TerminalResponse = z.infer<typeof terminalResponseSchema>;
export interface TerminalApi {
  readonly styleNonce: string;
  start(cols: number, rows: number): Promise<TerminalState>;
  input(sessionId: string, data: string): Promise<TerminalState>;
  read(sessionId: string, cursor: number): Promise<TerminalState>;
  resize(sessionId: string, cols: number, rows: number): Promise<TerminalState>;
  interrupt(sessionId: string): Promise<TerminalState>;
  close(sessionId: string): Promise<TerminalState>;
}
