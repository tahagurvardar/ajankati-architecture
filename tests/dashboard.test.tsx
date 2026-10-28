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
    fireEvent.click(
      screen.getByRole("button", { name: "Projeler / Görevler" }),
    );
    fireEvent.change(screen.getByLabelText("Yeni proje adı"), {
      target: { value: "Arayüz projesi" },
    });
    await waitFor(() =>
      expect(
        (screen.getByText("+ Proje oluştur") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Genel Bakış" }));
    fireEvent.click(screen.getByRole("button", { name: "Panel Görünümü" }));
    expect(
      screen.getByRole("region", { name: "Proje özeti" }).textContent,
    ).toContain("Kabul edildi: 1");
    fireEvent.click(screen.getByRole("button", { name: "Ofis Görünümü" }));
    expect(screen.getByRole("img", { name: /Statik/ })).toBeTruthy();
    cleanup();
    render(<Dashboard api={api} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Projeler / Görevler" }),
    );
    await screen.findByText("Kabul edildi");
    fireEvent.change(screen.getByLabelText("Yeni proje adı"), {
      target: { value: "İkinci proje" },
    });
    fireEvent.click(screen.getByText("+ Proje oluştur"));
    await screen.findByRole("heading", { name: "İkinci proje" });
    expect(screen.queryByRole("heading", { name: "İlk teslim" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Yeni görevin hedefi"), {
      target: { value: "İptal denemesi" },
    });
    fireEvent.click(screen.getByText("Görev ekle"));
    fireEvent.click(await screen.findByText("İptal et"));
    await screen.findByText("İptal edildi");
    expect(
      store.snapshot().tasks.find((task) => task.title === "İptal denemesi")
        ?.status,
    ).toBe("cancelled");
    fireEvent.click(screen.getByRole("button", { name: "Genel Bakış" }));
    fireEvent.click(screen.getByRole("button", { name: "Panel Görünümü" }));
    const summary = screen.getByRole("region", { name: "Proje özeti" });
    expect(summary.textContent).toContain("Kabul edildi: 1");
    expect(summary.textContent).toContain("İptal edildi: 1");
    expect(summary.querySelectorAll("article")).toHaveLength(2);
    expect(summary.querySelectorAll("article")[0].textContent).not.toContain(
      "İptal edildi",
    );
  } finally {
    await service.stop();
    store.close();
  }
});

it("keeps unknown snapshot counts honest, supports retry and navigates placeholders", async () => {
  const snapshot = {
    mode: "mock" as const,
    projects: [],
    tasks: [],
    events: [],
  };
  let rejectLoad!: (error: Error) => void;
  let attempts = 0;
  const unavailable = async () => {
    throw new Error("Unexpected mutation");
  };
  const api: DesktopApi = {
    createProject: unavailable,
    createTask: unavailable,
    ready: unavailable,
    run: unavailable,
    cancel: unavailable,
    accept: unavailable,
    snapshot: () =>
      ++attempts === 1
        ? new Promise<typeof snapshot>((_resolve, reject) => {
            rejectLoad = reject;
          })
        : Promise.resolve(snapshot),
  };
  render(<Dashboard api={api} />);
  expect(screen.getByRole("status").textContent).toContain("Yükleniyor");
  expect(
    screen.getByRole("region", { name: "Çalışma alanı özeti" }).textContent,
  ).toContain("—");
  rejectLoad(new Error("offline"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Yenile" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Panel Görünümü" }));
  expect(screen.queryByRole("img", { name: /Statik/ })).toBeNull();
  expect(screen.getByText("Henüz proje yok")).toBeTruthy();
  for (const name of [
    "Onaylar",
    "Bilgi Kaynakları",
    "Raporlar",
    "Entegrasyonlar",
  ]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(name);
    expect(screen.getByText("Henüz kullanılamıyor")).toBeTruthy();
    expect(
      screen.getByRole("button", { name }).getAttribute("aria-current"),
    ).toBe("page");
  }
});
