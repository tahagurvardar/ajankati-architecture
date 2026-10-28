import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../packages/storage/src/index";
import {
  CodexProtocolSession,
  type CodexTransport,
} from "../apps/worker/src/codex-session";

class Fixture implements CodexTransport {
  sent: Record<string, unknown>[] = [];
  closed = 0;
  clean = true;
  data: (chunk: Buffer) => void = () => {};
  exit: () => void = () => {};
  subscribe(data: (chunk: Buffer) => void, exit: () => void) {
    this.data = data;
    this.exit = exit;
    return () => {
      this.data = () => {};
      this.exit = () => {};
    };
  }
  write(line: string) {
    this.sent.push(JSON.parse(line));
  }
  async terminate() {
    this.closed++;
    return this.clean;
  }
  emit(value: unknown) {
    this.data(Buffer.from(JSON.stringify(value) + "\n"));
  }
}
let store: Store;
let fixture: Fixture;
let host: CodexProtocolSession;
let projectId: string;
const plan = () => ({
  projectId,
  cliVersion: "fixture-0.164.0",
  cliIdentity: "fixture",
  model: "fixture-model",
  cwd: "C:\\fixture",
  prompt: "private prompt",
  approved: true as const,
});
function running() {
  host.start(plan());
  fixture.emit({ id: 1, result: { userAgent: "fixture" } });
  fixture.emit({ id: 2, result: { thread: { id: "thread-1" } } });
  fixture.emit({
    id: 3,
    result: { turn: { id: "turn-1", status: "inProgress" } },
  });
}
const notification = (method: string, extra: object) => ({
  method,
  params: { threadId: "thread-1", turnId: "turn-1", ...extra },
});
beforeEach(() => {
  vi.useFakeTimers();
  store = new Store(":memory:");
  projectId = store.createProject("p").id;
  fixture = new Fixture();
  host = new CodexProtocolSession(store, () => fixture, {
    deadlineMs: 1000,
    graceMs: 50,
  });
});
afterEach(async () => {
  await host.stop();
  store.close();
  vi.useRealTimers();
});
describe("Codex protocol fixture (no real executable or inference)", () => {
  it("does not initialize after a synchronous transport exit during subscription", async () => {
    fixture.subscribe = (_data, exit) => {
      exit();
      return () => {};
    };
    host.start(plan());
    await host.idle();
    expect(fixture.sent).toEqual([]);
    expect(fixture.closed).toBe(1);
  });
  it("ignores callbacks retained by a previous transport epoch", async () => {
    running();
    const oldData = fixture.data;
    const oldExit = fixture.exit;
    await host.stop();
    host.start(plan());
    oldData(Buffer.from("broken\n"));
    oldExit();
    await host.idle();
    expect(store.sessions()[0]?.status).toBe("starting");
    expect(fixture.sent.at(-1)?.method).toBe("initialize");
  });
  it("accepts fragmented UTF-8 JSONL and starts a fresh session only after confirmed cleanup", async () => {
    host.start(plan());
    const bytes = Buffer.from(
      JSON.stringify({ id: 1, result: { userAgent: "İı fixture" } }) + "\n",
    );
    for (const byte of bytes) fixture.data(Buffer.from([byte]));
    expect(fixture.sent.at(-1)?.method).toBe("thread/start");
    await host.stop();
    host.start(plan());
    expect(store.sessions()).toHaveLength(2);
    expect(store.sessions()[0]?.retryCount).toBe(0);
  });
  it("rejects out-of-order responses without submitting a turn", async () => {
    host.start(plan());
    fixture.emit({ id: 2, result: { thread: { id: "t" } } });
    await host.idle();
    expect(store.sessions()[0]?.reason).toBe("PROTOCOL_ERROR");
    expect(fixture.sent.some((x) => x.method === "turn/start")).toBe(false);
  });
  it("records provider failure and leaves missing usage unknown", async () => {
    running();
    fixture.emit(
      notification("turn/completed", {
        turn: { id: "turn-1", status: "failed" },
      }),
    );
    await host.idle();
    expect(store.sessions()[0]).toMatchObject({
      status: "failed",
      reason: "PROVIDER_FAILED",
      totalTokens: null,
    });
  });
  it("quarantines after a bounded cleanup timeout", async () => {
    running();
    fixture.terminate = () => new Promise<boolean>(() => {});
    const stopping = host.stop();
    await vi.advanceTimersByTimeAsync(5001);
    await stopping;
    expect(store.sessions()[0]).toMatchObject({
      reason: "CLEANUP_UNCONFIRMED",
      endedAt: null,
      durationMs: null,
    });
    expect(() =>
      new CodexProtocolSession(store, () => new Fixture()).start(plan()),
    ).toThrow();
  });
  it("initializes in order, scopes one turn, deduplicates cumulative usage and never stores prompt/output", async () => {
    running();
    expect(fixture.sent.map((x) => x.method)).toEqual([
      "initialize",
      "initialized",
      "thread/start",
      "turn/start",
    ]);
    expect(fixture.sent[2]?.params).toMatchObject({
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandbox: "read-only",
      ephemeral: true,
    });
    expect(() => host.start(plan())).toThrow();
    const sample = notification("thread/tokenUsage/updated", {
      tokenUsage: { total: { totalTokens: 12 } },
    });
    fixture.emit(sample);
    fixture.emit(sample);
    fixture.emit({
      ...sample,
      params: { ...sample.params, threadId: "other" },
    });
    fixture.emit(
      notification("turn/completed", {
        turn: { id: "turn-1", status: "completed" },
      }),
    );
    await host.idle();
    expect(store.sessions()[0]).toMatchObject({
      status: "completed",
      totalTokens: 12,
      source: "fixture",
      cost: "UNKNOWN",
      retryCount: 0,
    });
    expect(JSON.stringify(store.sessions())).not.toContain("private prompt");
    expect(fixture.closed).toBe(1);
  });
  it.each([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "item/tool/requestUserInput",
    "unknown/request",
  ])("fails closed on %s without an accept response", async (method) => {
    running();
    fixture.emit({
      id: 99,
      ...notification(method, { command: "sensitive", itemId: "i" }),
    });
    await host.idle();
    expect(store.sessions()[0]).toMatchObject({
      status: "interrupted",
      reason: "APPROVAL_REQUIRED",
    });
    expect(JSON.stringify(fixture.sent)).not.toContain('"accept');
    expect(fixture.closed).toBe(1);
  });
  it("interrupts by structured request then terminates after grace and ignores late completion", async () => {
    running();
    host.interrupt();
    expect(fixture.sent.at(-1)?.method).toBe("turn/interrupt");
    fixture.emit(
      notification("turn/completed", {
        turn: { id: "turn-1", status: "completed" },
      }),
    );
    await vi.advanceTimersByTimeAsync(51);
    await host.idle();
    expect(store.sessions()[0]?.status).toBe("cancelled");
  });
  it("times out a stalled handshake and does not retry", async () => {
    host.start(plan());
    await vi.advanceTimersByTimeAsync(1001);
    await host.idle();
    expect(store.sessions()[0]).toMatchObject({
      status: "failed",
      reason: "TIMEOUT",
      totalTokens: null,
    });
    expect(fixture.sent).toHaveLength(1);
  });
  it.each(["not-json\n", "x".repeat(256 * 1024 + 1)])(
    "terminates malformed or oversized framing",
    async (chunk) => {
      running();
      fixture.data(Buffer.from(chunk));
      await host.idle();
      expect(store.sessions()[0]?.reason).toBe("PROTOCOL_ERROR");
    },
  );
  it("does not mistake a zero process exit for turn completion", async () => {
    running();
    fixture.exit();
    await host.idle();
    expect(store.sessions()[0]).toMatchObject({
      status: "failed",
      reason: "PROCESS_EXIT",
    });
  });
  it("poisons the host when cleanup is not confirmed", async () => {
    running();
    fixture.clean = false;
    await host.stop();
    expect(store.sessions()[0]?.reason).toBe("CLEANUP_UNCONFIRMED");
    expect(() => host.start(plan())).toThrow();
    const second = new CodexProtocolSession(store, () => new Fixture());
    expect(() => second.start(plan())).toThrow();
  });
  it("still terminates if removing transport listeners throws", async () => {
    fixture.subscribe = (data, exit) => {
      fixture.data = data;
      fixture.exit = exit;
      return () => {
        throw new Error("detach failed");
      };
    };
    running();
    await host.stop();
    expect(fixture.closed).toBe(1);
    expect(() =>
      new CodexProtocolSession(store, () => new Fixture()).start(plan()),
    ).toThrow();
  });
  it("rejects approval false before transport creation or ledger insertion", () => {
    expect(() =>
      host.start({ ...plan(), approved: false } as unknown as Parameters<
        typeof host.start
      >[0]),
    ).toThrow();
    expect(store.sessions()).toEqual([]);
    expect(fixture.sent).toEqual([]);
  });
});
