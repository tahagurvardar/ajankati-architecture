// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Dashboard } from "../apps/desktop/renderer/Dashboard";
import { Store } from "../packages/storage/src/index";
import { WorkerService } from "../apps/worker/src/service";
import { MockAgent } from "../packages/adapters/src/index";
import type { DesktopApi } from "../packages/contracts/src/index";
afterEach(cleanup);
it("offers a Turkish project/task workflow backed by the real service and database", async () => {
  const store = new Store(":memory:");
  const service = new WorkerService(store, new MockAgent());
  async function call(method: string, payload: unknown = {}) {
    const result = await service.handle({
      version: 1,
      requestId: "ui",
      method,
      payload,
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  }
  const api: DesktopApi = {
    snapshot: () => call("snapshot"),
    createProject: (name) => call("project.create", { name }),
    createTask: (projectId, title) => call("task.create", { projectId, title }),
    ready: (taskId, revision) => call("task.ready", { taskId, revision }),
    run: (taskId, revision) => call("task.run", { taskId, revision }),
    cancel: (taskId, revision) => call("task.cancel", { taskId, revision }),
    accept: (taskId, revision, resultHash) =>
      call("task.accept", { taskId, revision, resultHash }),
  };
  try {
    render(<Dashboard api={api} />);
    expect(screen.getByText("Demo — gerçek ajan çalışmıyor")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Yeni proje adı"), {
      target: { value: "Arayüz projesi" },
    });
    fireEvent.click(screen.getByText("+ Proje oluştur"));
    await screen.findByRole("heading", { name: "Arayüz projesi" });
    fireEvent.change(screen.getByLabelText("Yeni görevin hedefi"), {
      target: { value: "İlk teslim" },
    });
    fireEvent.click(screen.getByText("Görev ekle"));
    fireEvent.click(await screen.findByText("Hazırla"));
    fireEvent.click(await screen.findByText("Demo ajanını çalıştır"));
    fireEvent.click(await screen.findByText("Teslimi kabul et"));
    await waitFor(() =>
      expect(store.snapshot().tasks[0]!.status).toBe("succeeded"),
    );
  } finally {
    await service.stop();
    store.close();
  }
});
