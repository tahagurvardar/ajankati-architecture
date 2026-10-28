import type { MessagePort } from "node:worker_threads";

export interface NativeStdio {
  open(profile: string): object;
  snapshot(owner: object): {
    active: number;
    pid: number;
    verified: boolean;
    exited: boolean;
    exitCode: number | null;
    stdoutClosed: boolean;
    stderrClosed: boolean;
  };
  read(owner: object, stderr: boolean): Buffer;
  write(owner: object, data: Buffer): void;
  stop(owner: object): boolean;
  close(owner: object): void;
}

/** Runs only on a dedicated thread. Internal dependency seam is not an IPC API. */
export function runStdioOwner(
  native: NativeStdio,
  profile: string,
  port: MessagePort,
): void {
  let owner: object | undefined;
  let closed = false;
  let ending: string | undefined;
  let cleaned = false;
  let awaitingAck = false;
  let stderrBytes = 0;
  let stdoutBytes = 0;
  let providerExitCode: number | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let cleanupDeadline: ReturnType<typeof setTimeout> | undefined;
  const close = (code: string, outputDrained = false) => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearTimeout(deadline);
    clearTimeout(cleanupDeadline);
    try {
      if (owner) native.close(owner);
    } catch {
      cleaned = false;
    }
    port.postMessage({
      kind: "closed",
      code,
      cleaned,
      providerExitCode,
      stderrBytes,
      stdoutBytes,
      outputDrained,
    });
    port.close();
  };
  const finish = (code: string) => {
    if (closed || ending) return;
    ending = code;
    try {
      if (owner) {
        // Observe natural exit before our forced job termination; never call 137 a provider exit.
        const state = native.snapshot(owner);
        providerExitCode = state.exitCode;
        if (code === "STOPPED" && state.exited) ending = "PROCESS_EXIT";
        cleaned = native.stop(owner) && native.snapshot(owner).active === 0;
      } else cleaned = code !== "CLEANUP_UNCONFIRMED";
    } catch {
      cleaned = false;
    }
    if (!owner || !cleaned) return close(ending);
    // Keep pipe handles alive and preserve the single outstanding data ACK.
    cleanupDeadline = setTimeout(() => close("OUTPUT_DRAIN_TIMEOUT"), 1500);
  };
  const deadline = setTimeout(() => {
    finish("TIMEOUT");
  }, 15000);
  try {
    owner = native.open(profile);
    port.postMessage({ kind: "ready", ...native.snapshot(owner) });
    interval = setInterval(() => {
      try {
        // Observe exit BEFORE reading, avoiding the empty-read/exit race.
        if (!ending && native.snapshot(owner!).exited) finish("PROCESS_EXIT");
        if (closed) return;
        stderrBytes += native.read(owner!, true).length;
        if (stderrBytes > 262144) {
          finish("STDERR_LIMIT");
          return close("STDERR_LIMIT");
        }
        if (!awaitingAck) {
          const chunk = native.read(owner!, false);
          stdoutBytes += chunk.length;
          if (stdoutBytes > 262144) {
            finish("STDOUT_LIMIT");
            return close("STDOUT_LIMIT");
          }
          if (chunk.length) {
            awaitingAck = true;
            port.postMessage({ kind: "data", chunk });
          }
        }
        const state = native.snapshot(owner!);
        if (!ending && state.stdoutClosed)
          finish(state.exited ? "PROCESS_EXIT" : "STDOUT_CLOSED");
        if (ending && !awaitingAck && state.stdoutClosed && state.stderrClosed)
          close(ending, true);
      } catch {
        finish("PIPE_READ_FAILED");
        close("PIPE_READ_FAILED");
      }
    }, 10);
    port.on("message", (message: { kind: string; data?: Uint8Array }) => {
      if (closed) return;
      if (message.kind === "ack") {
        awaitingAck = false;
        return;
      }
      if (message.kind === "stop") return finish("STOPPED");
      if (ending) return;
      if (
        message.kind !== "write" ||
        !message.data ||
        !message.data.length ||
        message.data.length > 65536
      )
        return finish("WRITE_LIMIT");
      try {
        native.write(owner!, Buffer.from(message.data));
        port.postMessage({ kind: "written" });
      } catch (error) {
        finish(nativeCode(error, "PIPE_WRITE_FAILED"));
      }
    });
  } catch (error) {
    finish(nativeCode(error, "LAUNCH_FAILED"));
  }
}

// Native errors use static codes; no error messages, paths or payloads cross the port.
function nativeCode(error: unknown, fallback: string): string {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z_]{1,63}$/.test(code)
    ? code
    : fallback;
}
