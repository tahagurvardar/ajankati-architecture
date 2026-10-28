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
const response = z
  .object({
    id: z.literal(1),
    result: z.object({ userAgent: z.string().min(1).max(4096) }),
  })
  .strict();

/** Non-inference protocol path. No thread, turn, model, auth or approval requests. */
export async function initializeOnly(
  transport: CodexTransport & { drain(): Promise<void> },
): Promise<{ initialized: true; cleaned: true }> {
  let buffer = Buffer.alloc(0);
  let received = false;
  let failure: Error | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (code: string) => {
        failure = new StdioError(code);
        reject(failure);
      };
      timer = setTimeout(() => fail("HANDSHAKE_TIMEOUT"), 5000);
      unsubscribe = transport.subscribe(
        (chunk) => {
          try {
            if (received || buffer.length + chunk.length > 262144)
              return fail("FRAME_LIMIT");
            buffer = Buffer.concat([buffer, chunk]);
            const end = buffer.indexOf(10);
            if (end < 0) return;
            if (end !== buffer.length - 1) return fail("UNEXPECTED_MESSAGE");
            response.parse(
              JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(
                  buffer.subarray(0, end),
                ),
              ),
            );
            buffer = Buffer.alloc(0);
            received = true;
            resolve();
          } catch {
            fail("PROTOCOL_ERROR");
          }
        },
        () => {
          if (!received) fail(buffer.length ? "PARTIAL_FRAME" : "PROCESS_EXIT");
        },
      );
      transport.write(JSON.stringify(initializeRequest()) + "\n");
    });
    if (failure) throw failure;
    transport.write('{"method":"initialized","params":{}}\n');
    await transport.drain();
    if (failure) throw failure;
  } catch (error) {
    failure = error instanceof Error ? error : new StdioError("PROTOCOL_ERROR");
  } finally {
    clearTimeout(timer);
  }
  let cleaned: boolean;
  try {
    cleaned = await transport.terminate();
  } catch {
    cleaned = false;
  } finally {
    unsubscribe?.();
  }
  if (!cleaned) throw new StdioError("CLEANUP_FAILED");
  if (failure) throw failure;
  return { initialized: true, cleaned: true };
}
