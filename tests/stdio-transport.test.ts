import { it, expect } from "vitest";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { NativeStdioTransport } from "../apps/worker/src/native-stdio";
import { initializeOnly } from "../apps/worker/src/codex-handshake";

const start = () =>
  new NativeStdioTransport(
    new Worker(resolve("tests/fixtures/stdio-thread.cjs"), {
      workerData: process.cwd(),
    }),
  );

it.runIf(process.platform === "win32").each(["invalid", "partial"])(
  "rejects real native %s output and confirms tree cleanup",
  async (mode) => {
    const transport = start();
    transport.write(mode + "\n");
    await expect(initializeOnly(transport)).rejects.toThrow();
    expect(await transport.terminate()).toBe(true);
  },
);

it.runIf(process.platform === "win32")(
  "streams bounded native data without blocking the calling event loop",
  async () => {
    const transport = start();
    let output = "";
    transport.subscribe(
      (chunk) => {
        output += chunk.toString("utf8");
      },
      () => {},
    );
    try {
      transport.write('{"id":1,"method":"initialize"}\n');
      await expect.poll(() => output).toContain('"userAgent":"fixture"');
      expect(transport.pid).toBeGreaterThan(0);
      expect(await transport.terminate()).toBe(true);
      expect(() => transport.write("stale\n")).toThrow("OWNER_CLOSED");
    } finally {
      await transport.terminate();
    }
  },
);

it.runIf(process.platform === "win32")(
  "completes the non-inference driver over the real native fixture transport",
  async () => {
    const transport = start();
    await expect(initializeOnly(transport)).resolves.toEqual({
      initialized: true,
      cleaned: true,
    });
  },
);

it.runIf(process.platform === "win32")(
  "a stalled native pipe does not block timers and eventually cleans up",
  async () => {
    const transport = start();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 10);
    transport.subscribe(
      () => {},
      () => {},
    );
    try {
      transport.write("stall\n");
      await transport.drain();
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (let i = 0; i < 2; i++) {
        transport.write("x".repeat(65536));
        await transport.drain();
      }
      transport.write("x".repeat(65536));
      await expect(transport.drain()).rejects.toThrow();
      expect(ticks).toBeGreaterThan(20);
      expect(await transport.terminate()).toBe(true);
    } catch (error) {
      // Depending on pipe quota Windows can block the first or second full write.
      expect(String(error)).toContain("WRITE_TIMEOUT");
      expect(ticks).toBeGreaterThan(20);
      expect(await transport.terminate()).toBe(true);
    } finally {
      clearInterval(timer);
      await transport.terminate();
    }
  },
);

it.runIf(process.platform === "win32")(
  "rejects over-budget writes, cleaning the real tree",
  async () => {
    const transport = start();
    transport.subscribe(
      () => {},
      () => {},
    );
    expect(() => transport.write("x".repeat(65537))).toThrow("WRITE_LIMIT");
    expect(await transport.terminate()).toBe(true);
  },
);
