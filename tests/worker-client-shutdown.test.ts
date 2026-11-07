import { afterEach, expect, it } from "vitest";
import { resolve } from "node:path";
import { WorkerClient } from "../apps/desktop/main/worker-client";

const clients: WorkerClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

it("force-kills a worker that ignores graceful disconnect and rejects later requests", async () => {
  const client = new WorkerClient(
    resolve("tests/fixtures/stubborn-worker-peer.cjs"),
    "stubborn",
    false,
    { closeGraceMs: 300, killWaitMs: 2000 },
  );
  clients.push(client);
  await client.ready;
  const started = Date.now();
  await client.close();
  expect(Date.now() - started).toBeLessThan(2500);
  await expect(
    client.humanCli({ method: "list", payload: {} }),
  ).rejects.toThrow();
});
