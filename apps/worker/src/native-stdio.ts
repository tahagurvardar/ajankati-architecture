import { Worker } from "node:worker_threads";
import { join } from "node:path";
import type { CodexTransport } from "./codex-session";

export class StdioError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "StdioError";
  }
}

/** Internal transport. SessionHost never imports this; no renderer launch API. */
export class NativeStdioTransport implements CodexTransport {
  private data?: (chunk: Buffer) => void;
  private exit?: () => void;
  private queue: Buffer[] = [];
  private bytes = 0;
  private writing = false;
  private closed = false;
  private stopping = false;
  private ready = false;
  private drained?: { resolve(): void; reject(error: Error): void };
  private completed: Promise<boolean>;
  private complete!: (cleaned: boolean) => void;
  private timer: ReturnType<typeof setTimeout>;
  error?: StdioError;
  pid?: number;
  providerExitCode: number | null = null;
  stderrBytes = 0;
  stdoutBytes = 0;
  outputDrained = false;
  constructor(private thread: Worker) {
    this.completed = new Promise((resolve) => {
      this.complete = resolve;
    });
    this.timer = setTimeout(() => this.fail("TIMEOUT"), 18000);
    thread.on("message", (message) => {
      if (this.closed) return;
      if (message.kind === "closed") {
        this.providerExitCode = message.providerExitCode ?? null;
        this.stderrBytes = message.stderrBytes ?? 0;
        this.stdoutBytes = message.stdoutBytes ?? 0;
        this.outputDrained = message.outputDrained === true;
        if (message.code !== "STOPPED")
          this.error = new StdioError(message.code);
        this.finish(message.cleaned === true);
      } else if (message.kind === "ready") {
        this.ready = true;
        this.pid = message.pid;
        this.flush();
      } else if (message.kind === "data") {
        if (!this.data || message.chunk.length > 16384)
          return this.fail("READ_BACKPRESSURE");
        try {
          this.data(Buffer.from(message.chunk));
        } catch {
          this.fail("PROTOCOL_ERROR");
        }
        thread.postMessage({ kind: "ack" });
      } else if (message.kind === "written") {
        const sent = this.queue.shift();
        if (!sent) return this.fail("WRITE_STATE");
        this.bytes -= sent.length;
        this.writing = false;
        this.flush();
        if (!this.bytes) {
          this.drained?.resolve();
          this.drained = undefined;
        }
      } else this.fail("PROTOCOL_ERROR");
    });
    thread.once("error", () => this.fail("WORKER_ERROR"));
    thread.once("exit", () => {
      if (!this.closed) this.fail("WORKER_EXIT");
    });
  }
  private finish(cleaned: boolean): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.queue = [];
    this.bytes = 0;
    this.drained?.reject(this.error ?? new StdioError("OWNER_CLOSED"));
    this.drained = undefined;
    this.complete(cleaned);
    this.exit?.();
  }
  private fail(code: string): void {
    if (this.closed) return;
    this.error = new StdioError(code);
    // Finalization/kill-on-close is fallback, not a verified cleanup result.
    this.finish(false);
    void this.thread.terminate();
  }
  private flush(): void {
    if (
      !this.ready ||
      this.writing ||
      this.closed ||
      this.stopping ||
      !this.queue.length
    )
      return;
    this.writing = true;
    this.thread.postMessage({ kind: "write", data: this.queue[0] });
  }
  subscribe(data: (chunk: Buffer) => void, exit: () => void): () => void {
    if (this.data) throw new StdioError("ALREADY_SUBSCRIBED");
    this.data = data;
    this.exit = exit;
    if (this.closed) queueMicrotask(exit);
    return () => {
      this.data = undefined;
      this.exit = undefined;
    };
  }
  write(line: string): void {
    if (this.closed || this.stopping) throw new StdioError("OWNER_CLOSED");
    const data = Buffer.from(line, "utf8");
    if (
      !data.length ||
      this.queue.length >= 64 ||
      data.length + this.bytes > 65536 ||
      data.toString("utf8") !== line
    ) {
      void this.terminate();
      throw new StdioError("WRITE_LIMIT");
    }
    this.bytes += data.length;
    this.queue.push(data);
    this.flush();
  }
  terminate(): Promise<boolean> {
    if (!this.closed && !this.stopping) {
      this.stopping = true;
      this.thread.postMessage({ kind: "stop" });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.fail("CLEANUP_TIMEOUT"), 4000);
    }
    return this.completed;
  }
  drain(): Promise<void> {
    if (this.closed || this.stopping)
      return Promise.reject(new StdioError("OWNER_CLOSED"));
    if (!this.bytes) return Promise.resolve();
    if (this.drained) return Promise.reject(new StdioError("DRAIN_BUSY"));
    return new Promise((resolve, reject) => {
      this.drained = { resolve, reject };
    });
  }
}

export function createNativeProbeTransport(
  profile: string,
): NativeStdioTransport {
  return new NativeStdioTransport(
    new Worker(join(__dirname, "stdio-thread.cjs"), { workerData: profile }),
  );
}
