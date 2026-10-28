import type { MessagePort } from "node:worker_threads";

export interface NativeStdio {
  open(profile: string): object;
  snapshot(owner: object): {
    active: number;
    pid: number;
    verified: boolean;
    exited: boolean;
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
  let stopped = false;
  let awaitingAck = false;
  let stderrBytes = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  const finish = (code: string) => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    clearTimeout(deadline);
    let cleaned: boolean;
    try {
      if (owner)
        cleaned = native.stop(owner) && native.snapshot(owner).active === 0;
      else cleaned = code !== "CLEANUP_UNCONFIRMED";
    } catch {
      cleaned = false;
    } finally {
      if (owner) {
        try {
          native.close(owner);
        } catch {
          cleaned = false;
        }
      }
    }
    port.postMessage({ kind: "closed", code, cleaned });
    port.close();
  };
  const deadline = setTimeout(() => finish("TIMEOUT"), 15000);
  try {
    owner = native.open(profile);
    port.postMessage({ kind: "ready", ...native.snapshot(owner) });
    interval = setInterval(() => {
      try {
        stderrBytes += native.read(owner!, true).length;
        if (stderrBytes > 262144) return finish("STDERR_LIMIT");
        if (!awaitingAck) {
          const chunk = native.read(owner!, false);
          if (chunk.length) {
            awaitingAck = true;
            port.postMessage({ kind: "data", chunk });
          } else if (native.snapshot(owner!).exited) finish("PROCESS_EXIT");
        }
      } catch {
        finish("PIPE_READ_FAILED");
      }
    }, 10);
    port.on("message", (message: { kind: string; data?: Uint8Array }) => {
      if (stopped) return;
      if (message.kind === "stop") return finish("STOPPED");
      if (message.kind === "ack") {
        awaitingAck = false;
        return;
      }
      if (
        message.kind !== "write" ||
        !message.data ||
        message.data.length > 65536
      )
        return finish("WRITE_LIMIT");
      try {
        native.write(owner!, Buffer.from(message.data));
        port.postMessage({ kind: "written" });
      } catch (error) {
        finish(
          error instanceof Error && "code" in error
            ? String(error.code)
            : "PIPE_WRITE_FAILED",
        );
      }
    });
  } catch (error) {
    finish(
      error instanceof Error && "code" in error
        ? String(error.code)
        : "LAUNCH_FAILED",
    );
  }
}
