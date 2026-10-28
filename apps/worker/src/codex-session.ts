import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import { z } from "zod";
import { MAX_FRAME_BYTES, type SessionUsage } from "@ajankati/contracts";
import type { Store } from "@ajankati/storage";

/** Transport MUST own its process tree and confirm cleanup. No live implementation
 * exists yet. Only fixtures instantiate this protocol driver; no IPC can inject it. */
export interface CodexTransport {
  subscribe(data: (chunk: Buffer) => void, exit: () => void): () => void;
  write(jsonLine: string): void;
  terminate(): Promise<boolean>;
}
const planSchema = z
  .object({
    projectId: z.string().min(1).max(100),
    approved: z.literal(true),
    cliIdentity: z.string().min(1).max(200),
    cliVersion: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    cwd: z.string().min(1).max(4096),
    prompt: z.string().min(1).max(16000),
  })
  .strict();
type Plan = z.infer<typeof planSchema>;
const wireId = z.union([z.string().min(1).max(100), z.number().int().safe()]);
const messageSchema = z.object({
  id: wireId.optional(),
  method: z.string().max(200).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
const providerId = z.string().min(1).max(100);
const threadResult = z.object({ thread: z.object({ id: providerId }) });
const turnResult = z.object({
  turn: z.object({
    id: providerId,
    status: z.enum(["inProgress", "completed", "failed", "interrupted"]),
  }),
});
const totalUsage = z.object({
  tokenUsage: z.object({
    total: z.object({ totalTokens: z.number().int().nonnegative().safe() }),
  }),
});

export class CodexProtocolSession {
  private row?: SessionUsage;
  private transport?: CodexTransport;
  private unsubscribe?: () => void;
  private buffer = Buffer.alloc(0);
  private stage:
    | "idle"
    | "initialize"
    | "thread"
    | "turn"
    | "running"
    | "stopping" = "idle";
  private deadline?: ReturnType<typeof setTimeout>;
  private grace?: ReturnType<typeof setTimeout>;
  private finishing?: Promise<void>;
  private poisoned = false;
  private plan?: Plan;
  constructor(
    private store: Store,
    private createTransport: () => CodexTransport,
    private limits = { deadlineMs: 30_000, graceMs: 5_000 },
  ) {}

  start(input: Plan): void {
    const plan = planSchema.parse(input);
    if (this.stage !== "idle" || this.poisoned)
      throw new Error("Oturum sahibi kullanılamıyor.");
    this.row = {
      sessionId: randomUUID(),
      runId: randomUUID(),
      projectId: plan.projectId,
      provider: "codex",
      source: "fixture",
      cliIdentity: plan.cliIdentity,
      cliVersion: plan.cliVersion,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: "starting",
      retryCount: 0,
      threadId: null,
      turnId: null,
      totalTokens: null,
      tokenSource: null,
      cost: "UNKNOWN",
      quota: "UNKNOWN",
      reason: "NONE",
    };
    // Durable reservation BEFORE any transport side effects. DB enforces singleton.
    this.store.saveSession(this.row);
    this.plan = plan;
    this.stage = "initialize";
    this.finishing = undefined;
    this.buffer = Buffer.alloc(0);
    const sessionId = this.row.sessionId;
    try {
      this.transport = this.createTransport();
      this.unsubscribe = this.transport.subscribe(
        (chunk) => {
          if (this.row?.sessionId === sessionId) this.consume(chunk);
        },
        () => {
          if (this.row?.sessionId === sessionId)
            void this.finish("failed", "PROCESS_EXIT");
        },
      );
      if (this.finishing) return;
      this.deadline = setTimeout(() => {
        void this.finish("failed", "TIMEOUT");
      }, this.limits.deadlineMs);
      this.send({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "ajankati", title: "AjanKati", version: "0.1.0" },
          capabilities: { experimentalApi: false },
        },
      });
    } catch {
      void this.finish("failed", "PROTOCOL_ERROR");
    }
  }
  private send(message: unknown): void {
    this.transport!.write(JSON.stringify(message) + "\n");
  }
  private persist(): void {
    this.store.saveSession(this.row!);
  }
  private consume(chunk: Buffer): void {
    if (this.stage === "idle" || this.stage === "stopping") return;
    try {
      // Bound the entire callback as well as partial frames; fail closed, never truncate.
      if (chunk.length + this.buffer.length > MAX_FRAME_BYTES)
        throw new Error("Frame limit");
      this.buffer = Buffer.concat([this.buffer, chunk]);
      let newline: number;
      while ((newline = this.buffer.indexOf(10)) !== -1) {
        const line = this.buffer.subarray(0, newline);
        this.buffer = this.buffer.subarray(newline + 1);
        const value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(line),
        );
        this.receive(value);
        if (this.finishing) break;
      }
    } catch {
      void this.finish("failed", "PROTOCOL_ERROR");
    }
  }
  private receive(input: unknown): void {
    const message = messageSchema.parse(input);
    const row = this.row!;
    if (message.method && message.id !== undefined) {
      // No tool/action approval path in this milestone. Unknown requests also stop.
      row.status = "awaiting_approval";
      this.persist();
      void this.finish("interrupted", "APPROVAL_REQUIRED");
      return;
    }
    if (message.id !== undefined) {
      const expected = {
        initialize: 1,
        thread: 2,
        turn: 3,
        running: -1,
        idle: -1,
        stopping: -1,
      }[this.stage];
      if (
        message.id !== expected ||
        message.error !== undefined ||
        message.result === undefined
      )
        throw new Error("Unexpected response");
      if (this.stage === "initialize") {
        z.object({ userAgent: z.string().max(1000) }).parse(message.result);
        this.stage = "thread";
        this.send({ method: "initialized", params: {} });
        this.send({
          id: 2,
          method: "thread/start",
          params: {
            model: this.plan!.model,
            cwd: this.plan!.cwd,
            approvalPolicy: "untrusted",
            approvalsReviewer: "user",
            sandbox: "read-only",
            ephemeral: true,
          },
        });
      } else if (this.stage === "thread") {
        row.threadId = threadResult.parse(message.result).thread.id;
        this.persist();
        this.stage = "turn";
        this.send({
          id: 3,
          method: "turn/start",
          params: {
            threadId: row.threadId,
            input: [
              { type: "text", text: this.plan!.prompt, text_elements: [] },
            ],
          },
        });
        this.plan = undefined; // Never retain the prompt in the ledger or past delivery.
      } else {
        const turn = turnResult.parse(message.result).turn;
        row.turnId = turn.id;
        row.status = "running";
        this.stage = "running";
        this.persist();
        if (turn.status !== "inProgress") this.complete(turn.status);
      }
      return;
    }
    if (!message.method) throw new Error("Invalid notification");
    const params = message.params;
    if (message.method === "turn/completed") {
      if (params?.threadId !== row.threadId || this.stage !== "running") return;
      const turn = turnResult.parse(params).turn;
      if (turn.id !== row.turnId) return;
      if (turn.status === "inProgress") throw new Error("Invalid completion");
      this.complete(turn.status);
    } else if (message.method === "thread/tokenUsage/updated") {
      if (
        this.stage !== "running" ||
        params?.threadId !== row.threadId ||
        params?.turnId !== row.turnId
      )
        return;
      const total = totalUsage.parse(params).tokenUsage.total.totalTokens;
      if (row.totalTokens !== null && total < row.totalTokens)
        throw new Error("Usage regressed");
      row.totalTokens = total;
      row.tokenSource = "thread/tokenUsage/updated.total.totalTokens";
      this.persist();
    }
    // Non-authoritative progress notifications are intentionally discarded.
  }
  private complete(status: "completed" | "failed" | "interrupted"): void {
    void this.finish(status, status === "failed" ? "PROVIDER_FAILED" : "NONE");
  }
  interrupt(): void {
    if (this.stage === "idle" || this.stage === "stopping") return;
    if (!this.row?.turnId) {
      void this.finish("cancelled", "USER_CANCELLED");
      return;
    }
    this.stage = "stopping";
    clearTimeout(this.deadline);
    try {
      this.row.status = "stopping";
      this.persist();
      this.send({
        id: 4,
        method: "turn/interrupt",
        params: { threadId: this.row.threadId, turnId: this.row.turnId },
      });
      this.grace = setTimeout(() => {
        void this.finish("cancelled", "USER_CANCELLED");
      }, this.limits.graceMs);
    } catch {
      void this.finish("cancelled", "USER_CANCELLED");
    }
  }
  async stop(): Promise<void> {
    if (this.stage !== "idle") await this.finish("interrupted", "SHUTDOWN");
  }
  async idle(): Promise<void> {
    await this.finishing;
  }
  private finish(
    status: SessionUsage["status"],
    reason: SessionUsage["reason"],
  ): Promise<void> {
    if (this.finishing) return this.finishing;
    if (this.stage === "idle") return Promise.resolve();
    this.stage = "stopping";
    clearTimeout(this.deadline);
    clearTimeout(this.grace);
    this.plan = undefined;
    this.buffer = Buffer.alloc(0);
    this.finishing = Promise.resolve().then(async () => {
      let detached = true;
      try {
        this.unsubscribe?.();
      } catch {
        detached = false;
      }
      this.unsubscribe = undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let clean: boolean;
      try {
        clean = this.transport
          ? await Promise.race([
              this.transport.terminate(),
              new Promise<false>((resolve) => {
                timer = setTimeout(() => resolve(false), 5000);
              }),
            ])
          : true;
      } catch {
        clean = false;
      } finally {
        clearTimeout(timer);
      }
      clean = clean && detached;
      this.poisoned = !clean;
      const row = this.row!;
      row.status = clean ? status : "interrupted";
      row.reason = clean ? reason : "CLEANUP_UNCONFIRMED";
      row.endedAt = clean ? new Date().toISOString() : null;
      row.durationMs = clean
        ? Math.max(0, Date.now() - Date.parse(row.startedAt))
        : null;
      try {
        this.persist();
      } catch {
        this.poisoned = true;
      }
      this.transport = undefined;
      this.stage = "idle";
    });
    return this.finishing;
  }
}
