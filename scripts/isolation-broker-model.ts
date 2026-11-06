import { z } from "zod";

/** Offline design experiment only. No I/O, launcher, IPC server, approvals or
 * persistence. MODEL_ACCEPT is never a managed-task execution permit. Transport
 * identity and grants are synthetic trusted inputs, NOT authenticated here. */
const id = z.string().min(1).max(128);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const grantSchema = z
  .strictObject({
    runId: id,
    actionDigest: digest,
    channelId: id,
    resourceIds: z.array(id).min(1).max(64),
    issuedAt: integer,
    expiresAt: integer,
    byteBudget: integer.positive().max(1024 * 1024),
  })
  .refine((g) => g.expiresAt > g.issuedAt);
const requestSchema = z.strictObject({
  version: z.literal(1),
  operation: z.literal("read-resource"),
  runId: id,
  actionDigest: digest,
  sequence: integer,
  resourceId: id,
  maxBytes: integer.positive().max(1024 * 1024),
});

export function createBrokerModel(input: unknown) {
  const grant = grantSchema.parse(input);
  const resources = new Set(grant.resourceIds);
  let remaining = grant.byteBudget;
  let sequence = 0;
  let lastTime = grant.issuedAt;
  let closed = false;
  const result = (decision: "DENY" | "MODEL_ACCEPT") =>
    Object.freeze({ decision, executionAllowed: false as const });
  return Object.freeze({
    close() {
      closed = true;
    },
    review(input: unknown, trustedChannelId: string, now: number) {
      if (closed) return result("DENY");
      if (
        !Number.isSafeInteger(now) ||
        now < lastTime ||
        now >= grant.expiresAt
      ) {
        closed = true;
        return result("DENY");
      }
      lastTime = now;
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) return result("DENY");
      const request = parsed.data;
      if (
        trustedChannelId !== grant.channelId ||
        request.runId !== grant.runId ||
        request.actionDigest !== grant.actionDigest ||
        request.sequence !== sequence ||
        !resources.has(request.resourceId) ||
        request.maxBytes > remaining
      )
        return result("DENY");
      // Reserve before hypothetical delivery; failed/ambiguous delivery is not
      // refunded or replayed. This in-memory model cannot prove crash atomicity.
      remaining -= request.maxBytes;
      sequence++;
      return result("MODEL_ACCEPT");
    },
  });
}
