import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ child: undefined as unknown }));
vi.mock("node:child_process", () => ({ fork: vi.fn(() => fake.child) }));
import { WorkerClient } from "../apps/desktop/main/worker-client";

it("does not hold application quit forever when a killed worker never reports exit", async () => {
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    exitCode: null,
    signalCode: null,
    stdout: { resume: vi.fn() },
    stderr: { resume: vi.fn() },
    send: vi.fn(),
    kill: vi.fn(() => true),
    disconnect: vi.fn(() => {
      child.connected = false;
    }),
  });
  fake.child = child;
  const client = new WorkerClient("worker.cjs", "db", false, {
    closeGraceMs: 30,
    killWaitMs: 30,
  });
  child.emit("message", { type: "worker.ready", version: 1 });
  await client.ready;
  await client.close();
  expect(child.disconnect).toHaveBeenCalledTimes(1);
  expect(child.kill).toHaveBeenCalledTimes(1);
  await expect(
    client.humanCli({ method: "list", payload: {} }),
  ).rejects.toThrow();
});
