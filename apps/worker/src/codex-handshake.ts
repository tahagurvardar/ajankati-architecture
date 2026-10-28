import { TextDecoder } from "node:util";
import { z } from "zod";
import type { CodexTransport } from "./codex-session";
import { StdioError } from "./native-stdio";

export const initializeRequest = () => ({
  id: 1,
  method: "initialize",
  params: {
    clientInfo: { name: "ajankati", title: "AjanKati", version: "0.1.0" },
    capabilities: { experimentalApi: false },
  },
});
const text = z.string().max(32768);
const response = z
  .object({
    id: z.literal(1),
    // Additional 0.164.0 metadata is deliberately discarded, never logged.
    result: z.object({ userAgent: z.string().min(1).max(4096) }),
  })
  .strict();
const position = z
  .object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  })
  .strict();
// Only informational startup notifications. No request (id), tools or approvals.
const notification = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("warning"),
      params: z
        .object({ message: text, threadId: z.null().optional() })
        .strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("deprecationNotice"),
      params: z.object({ summary: text, details: text.nullish() }).strict(),
    })
    .strict(),
  z
    .object({
      method: z.literal("configWarning"),
      params: z
        .object({
          summary: text,
          details: text.nullish(),
          path: text.nullish(),
          range: z
            .object({ start: position, end: position })
            .strict()
            .nullish(),
        })
        .strict(),
    })
    .strict(),
]);

/** Non-inference protocol path. No thread, turn, model, auth or approval requests. */
export async function initializeOnly(
  transport: CodexTransport & { drain(): Promise<void>; error?: StdioError },
): Promise<{ initialized: true; cleaned: true }> {
  let buffer = Buffer.alloc(0);
  let received = false;
  let stopping = false;
  let totalBytes = 0;
  let frames = 0;
  let failure: Error | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (code: string) => {
        failure ??= new StdioError(code);
        reject(failure);
      };
      timer = setTimeout(() => fail("HANDSHAKE_TIMEOUT"), 5000);
      unsubscribe = transport.subscribe(
        (chunk) => {
          if (failure) return;
          totalBytes += chunk.length;
          if (totalBytes > 262144) return fail("FRAME_LIMIT");
          buffer = Buffer.concat([buffer, chunk]);
          let end: number;
          while ((end = buffer.indexOf(10)) >= 0) {
            if (++frames > 64) return fail("MESSAGE_LIMIT");
            const frame = buffer.subarray(0, end);
            buffer = buffer.subarray(end + 1);
            let decoded: string;
            try {
              decoded = new TextDecoder("utf-8", { fatal: true }).decode(frame);
            } catch {
              return fail("INVALID_UTF8");
            }
            let value: unknown;
            try {
              value = JSON.parse(decoded);
            } catch {
              return fail("INVALID_JSON");
            }
            if (value && typeof value === "object" && "method" in value) {
              if ("id" in value) return fail("UNEXPECTED_REQUEST");
              if (!notification.safeParse(value).success)
                return fail("UNEXPECTED_MESSAGE");
            } else {
              if (received) return fail("UNEXPECTED_MESSAGE");
              if (
                value &&
                typeof value === "object" &&
                "id" in value &&
                value.id === 1 &&
                "error" in value
              )
                return fail("INITIALIZE_REJECTED");
              if (!response.safeParse(value).success)
                return fail("INVALID_RESPONSE");
              received = true;
            }
          }
          if (received && !buffer.length) resolve();
        },
        () => {
          if (buffer.length) fail("PARTIAL_FRAME");
          else if (transport.error) fail(transport.error.code);
          else if (!stopping) fail("PROCESS_EXIT");
        },
      );
      transport.write(JSON.stringify(initializeRequest()) + "\n");
    });
    if (failure) throw failure;
    transport.write('{"method":"initialized","params":{}}\n');
    await transport.drain();
    if (failure) throw failure;
  } catch (error) {
    failure ??=
      error instanceof StdioError ? error : new StdioError("PROTOCOL_ERROR");
  } finally {
    clearTimeout(timer);
  }
  stopping = true;
  let cleaned: boolean;
  try {
    cleaned = await transport.terminate();
  } catch {
    cleaned = false;
  } finally {
    unsubscribe?.();
  }
  // A fixture may not emit exit; real transport does after draining both pipes.
  if (!failure && buffer.length) failure = new StdioError("PARTIAL_FRAME");
  if (!cleaned) throw new StdioError("CLEANUP_FAILED");
  if (failure) throw failure;
  return { initialized: true, cleaned: true };
}
