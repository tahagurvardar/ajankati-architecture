import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WorkerClient } from "../apps/desktop/main/worker-client";
const dir = mkdtempSync(join(tmpdir(), "ajankati-demo-"));
const worker = new WorkerClient(
  resolve("apps/worker/dist/index.cjs"),
  join(dir, "demo.sqlite"),
);
try {
  let state = await worker.request({
    method: "project.create",
    payload: { name: "Örnek proje" },
  });
  state = await worker.request({
    method: "task.create",
    payload: { projectId: state.projects[0]!.id, title: "İlk demo görevi" },
  });
  let task = state.tasks[0]!;
  state = await worker.request({
    method: "task.ready",
    payload: { taskId: task.id, revision: task.revision },
  });
  task = state.tasks[0]!;
  await worker.request({
    method: "task.run",
    payload: { taskId: task.id, revision: task.revision },
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    state = await worker.request({ method: "snapshot", payload: {} });
    if (state.tasks[0]!.status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  task = state.tasks[0]!;
  if (task.status !== "awaiting_review")
    throw new Error("Demo teslimi hazır değil.");
  console.log(task.result);
  console.log(
    "Durum: İnceleme bekliyor. Otomatik başarı veya insan kabulü oluşturulmadı.",
  );
} finally {
  await worker.close();
  rmSync(dir, { recursive: true, force: true });
}
