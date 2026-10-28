import { it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { MessagePort } from "node:worker_threads";
import { runStdioOwner, type NativeStdio } from "../apps/worker/src/stdio-io";

it("reports natural exit observed at stop instead of masking it as STOPPED", async () => {
  vi.useFakeTimers();
  const port = new EventEmitter();
  const messages: object[] = [];
  Object.assign(port, {
    postMessage(message: object) {
      messages.push(message);
    },
    close() {},
  });
  let exited = false;
  const native: NativeStdio = {
    open: () => ({}),
    snapshot: () => ({
      active: exited ? 0 : 1,
      pid: 1,
      verified: true,
      exited,
      exitCode: exited ? 23 : null,
      stdoutClosed: exited,
      stderrClosed: exited,
    }),
    read: () => Buffer.alloc(0),
    write() {},
    stop: () => true,
    close() {},
  };
  try {
    runStdioOwner(native, "fixture", port as unknown as MessagePort);
    exited = true;
    port.emit("message", { kind: "stop" });
    await vi.advanceTimersByTimeAsync(10);
    expect(messages.at(-1)).toMatchObject({
      kind: "closed",
      code: "PROCESS_EXIT",
      providerExitCode: 23,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("does not confuse a temporarily empty read with EOF when the root exits", async () => {
  vi.useFakeTimers();
  const port = new EventEmitter();
  const messages: { kind: string; chunk?: Buffer }[] = [];
  Object.assign(port, {
    postMessage(message: (typeof messages)[number]) {
      messages.push(message);
    },
    close() {},
  });
  let snapshots = 0;
  let stopped = false;
  const output = [Buffer.alloc(0), Buffer.from("final\n")];
  const native: NativeStdio = {
    open: () => ({}),
    snapshot: () => ({
      active: stopped ? 0 : 1,
      pid: 1,
      verified: true,
      exited: ++snapshots > 1,
      exitCode: 23,
      stdoutClosed: !output.length,
      stderrClosed: true,
    }),
    read: (_, stderr) =>
      stderr ? Buffer.alloc(0) : (output.shift() ?? Buffer.alloc(0)),
    write() {},
    stop() {
      stopped = true;
      return true;
    },
    close() {},
  };
  try {
    runStdioOwner(native, "fixture", port as unknown as MessagePort);
    await vi.advanceTimersByTimeAsync(10);
    expect(messages.some((m) => m.kind === "closed")).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    port.emit("message", { kind: "ack" });
    await vi.advanceTimersByTimeAsync(10);
    expect(messages.find((m) => m.kind === "data")?.chunk?.toString()).toBe(
      "final\n",
    );
    expect(messages.at(-1)).toMatchObject({
      kind: "closed",
      code: "PROCESS_EXIT",
      providerExitCode: 23,
      outputDrained: true,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("drains stdout and stderr after stop before reporting closed", async () => {
  vi.useFakeTimers();
  const port = new EventEmitter();
  const messages: { kind: string; chunk?: Buffer; stderrBytes?: number }[] = [];
  Object.assign(port, {
    postMessage(message: (typeof messages)[number]) {
      messages.push(message);
    },
    close() {},
  });
  let stopped = false;
  const output = [Buffer.from("first"), Buffer.from("last\n")];
  const errors = [Buffer.alloc(16384), Buffer.alloc(7)];
  const native: NativeStdio = {
    open: () => ({}),
    snapshot: () => ({
      active: stopped ? 0 : 1,
      pid: 1,
      verified: true,
      exited: stopped,
      exitCode: stopped ? 137 : null,
      stdoutClosed: !output.length,
      stderrClosed: !errors.length,
    }),
    read: (_, stderr) => (stderr ? errors : output).shift() ?? Buffer.alloc(0),
    write() {},
    stop() {
      stopped = true;
      return true;
    },
    close() {},
  };
  try {
    runStdioOwner(native, "fixture", port as unknown as MessagePort);
    await vi.advanceTimersByTimeAsync(10);
    port.emit("message", { kind: "stop" });
    expect(messages.some((m) => m.kind === "closed")).toBe(false);
    port.emit("message", { kind: "ack" });
    await vi.advanceTimersByTimeAsync(10);
    port.emit("message", { kind: "ack" });
    await vi.advanceTimersByTimeAsync(20);
    expect(
      Buffer.concat(
        messages.filter((m) => m.kind === "data").map((m) => m.chunk!),
      ).toString(),
    ).toBe("firstlast\n");
    expect(messages.at(-1)).toMatchObject({
      kind: "closed",
      cleaned: true,
      stderrBytes: 16391,
    });
  } finally {
    vi.useRealTimers();
  }
});
