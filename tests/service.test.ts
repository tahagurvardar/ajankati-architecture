import { afterEach, expect, it } from "vitest";
import { Store } from "../packages/storage/src/index";
import { WorkerService } from "../apps/worker/src/service";
import { MockAgent } from "../packages/adapters/src/index";
const s = new Store(":memory:");
const service = new WorkerService(s, new MockAgent());
afterEach(async () => {
  await service.stop();
  s.close();
});
it("runs a mock task, stops at review, and rejects stale or forged commands", async () => {
  const call = (method: string, payload: unknown = {}) =>
    service.handle({ version: 1, requestId: "test", method, payload });
  expect((await call("shell.exec")).ok).toBe(false);
  await call("project.create", { name: "Demo" });
  const p = s.snapshot().projects[0]!;
  await call("task.create", { projectId: p.id, title: "Görev" });
  let t = s.snapshot().tasks[0]!;
  await call("task.ready", { taskId: t.id, revision: 0 });
  t = s.getTask(t.id);
  const run = await call("task.run", { taskId: t.id, revision: t.revision });
  expect(run.ok).toBe(true);
  expect(s.getTask(t.id).status).toBe("running");
  await service.idle();
  t = s.getTask(t.id);
  expect(t.status).toBe("awaiting_review");
  expect(t.result).toContain("Demo — gerçek ajan çalışmıyor");
  expect(
    (
      await call("task.accept", {
        taskId: t.id,
        revision: t.revision,
        resultHash: "0".repeat(64),
      })
    ).ok,
  ).toBe(false);
  await call("task.accept", {
    taskId: t.id,
    revision: t.revision,
    resultHash: t.resultHash,
  });
  expect(s.getTask(t.id).status).toBe("succeeded");
});
