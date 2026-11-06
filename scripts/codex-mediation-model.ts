import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { z } from "zod";

/** Offline, single-call experiment. No transport, executor, persistence or live
 * approval response. Context/review are trusted SYNTHETIC inputs, not identity
 * authentication. Wire schemas deliberately accept less than Codex 0.164.0.
 * Canonical JSONL only: noncanonical frames (including duplicate keys) close it.
 */
const id = z.string().min(1).max(100);
const integer = z.number().int().nonnegative().safe();
const contextSchema = z.strictObject({
  threadId: id,
  turnId: id,
  callId: id,
  resourceId: id,
  channelId: id,
  expiresAt: integer.positive(),
});
const requestSchema = z.strictObject({
  id: z.union([id, z.number().int().safe()]),
  method: z.literal("item/tool/call"),
  params: z.strictObject({
    threadId: id,
    turnId: id,
    callId: id,
    namespace: z.null(),
    tool: z.literal("fixture_read_resource"),
    arguments: z.strictObject({
      resourceId: id,
      maxBytes: integer.positive().max(32),
    }),
  }),
});
// The body is deliberately opaque: observation is never a gate or authorization.
const notificationSchema = z.strictObject({
  method: z.enum([
    "item/started",
    "item/completed",
    "item/commandExecution/outputDelta",
    "item/mcpToolCall/progress",
    "hook/started",
  ]),
  params: z.record(z.string(), z.unknown()),
});
const reviewSchema = z.strictObject({
  requestId: z.union([id, z.number().int().safe()]),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.literal("approve-once"),
});
type Decision =
  | "DENY"
  | "BUFFERING"
  | "OBSERVED"
  | "AWAITING_REVIEW"
  | "MODEL_ACCEPT";

export function createMediationModel(input: unknown) {
  const context = contextSchema.parse(input);
  let buffer = Buffer.alloc(0);
  let closed = false;
  let lastTime = 0;
  let bytes = 0;
  let frames = 0;
  let pending: { id: string | number; digest: string } | undefined;
  const result = (decision: Decision, digest?: string) =>
    Object.freeze({
      decision,
      executionAllowed: false as const,
      liveExecution: false as const,
      ...(digest ? { digest } : {}),
    });
  const close = () => {
    closed = true;
    pending = undefined;
    buffer = Buffer.alloc(0);
  };
  const deny = () => {
    close();
    return result("DENY");
  };
  const validContext = (channel: string, now: number) => {
    if (
      closed ||
      channel !== context.channelId ||
      !Number.isSafeInteger(now) ||
      now < lastTime ||
      now >= context.expiresAt
    )
      return false;
    lastTime = now;
    return true;
  };
  return Object.freeze({
    close,
    feed(chunk: Uint8Array, trustedChannel: string, now: number) {
      if (!validContext(trustedChannel, now)) return deny();
      bytes += chunk.byteLength;
      if (bytes > 256 * 1024 || buffer.length + chunk.byteLength > 4096)
        return deny();
      buffer = Buffer.concat([buffer, chunk]);
      let decision: Decision = pending ? "AWAITING_REVIEW" : "BUFFERING";
      let newline: number;
      try {
        while ((newline = buffer.indexOf(10)) !== -1) {
          if (++frames > 64) return deny();
          const end =
            newline > 0 && buffer[newline - 1] === 13 ? newline - 1 : newline;
          const line = new TextDecoder("utf-8", { fatal: true }).decode(
            buffer.subarray(0, end),
          );
          buffer = buffer.subarray(newline + 1);
          const value: unknown = JSON.parse(line);
          if (JSON.stringify(value) !== line) return deny();
          if (notificationSchema.safeParse(value).success) {
            decision = pending ? "AWAITING_REVIEW" : "OBSERVED";
            continue;
          }
          const parsed = requestSchema.safeParse(value);
          if (!parsed.success || pending) return deny();
          const request = parsed.data;
          const p = request.params;
          if (
            p.threadId !== context.threadId ||
            p.turnId !== context.turnId ||
            p.callId !== context.callId ||
            p.arguments.resourceId !== context.resourceId
          )
            return deny();
          pending = {
            id: request.id,
            digest: createHash("sha256")
              .update(
                JSON.stringify([
                  "ajankati-offline-mediation-v1",
                  context,
                  request,
                ]),
              )
              .digest("hex"),
          };
          decision = "AWAITING_REVIEW";
        }
      } catch {
        return deny();
      }
      return result(decision, pending?.digest);
    },
    review(input: unknown, trustedChannel: string, now: number) {
      if (!validContext(trustedChannel, now) || buffer.length !== 0)
        return deny();
      const parsed = reviewSchema.safeParse(input);
      if (
        !parsed.success ||
        !pending ||
        parsed.data.requestId !== pending.id ||
        parsed.data.digest !== pending.digest
      )
        return deny();
      close(); // One use, no reopening/retry API. Still no execution authority.
      return result("MODEL_ACCEPT");
    },
  });
}
