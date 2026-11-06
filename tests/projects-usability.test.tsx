// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Dashboard } from "../apps/desktop/renderer/Dashboard";
import type {
  DesktopApi,
  Snapshot,
  Task,
  TaskStatus,
} from "../packages/contracts/src/index";

afterEach(cleanup);

const hash = "a".repeat(64);
function task(id: string, status: TaskStatus, projectId = "p1"): Task {
  return {
    id,
    projectId,
    title: `Görev ${id}`,
    status,
    revision: 2,
    createdAt: "2026-11-01T09:00:00.000Z",
    updatedAt: "2026-11-01T09:00:00.000Z",
    runId: null,
    result: status === "awaiting_review" ? "Demo çıktısı" : null,
    resultHash: status === "awaiting_review" ? hash : null,
    executionMode: "mock",
  };
}
function setup(tasks: Task[]) {
  const snapshot: Snapshot = {
    mode: "mock",
    projects: [
      { id: "p1", name: "Birinci", createdAt: "2026-11-01" },
      { id: "p2", name: "İkinci", createdAt: "2026-11-02" },
    ],
    tasks,
    events: [],
  };
  const calls = vi.fn(async () => snapshot);
  const api: DesktopApi = {
    snapshot: async () => snapshot,
    createProject: calls,
    createTask: calls,
    ready: calls,
    run: calls,
    cancel: calls,
    accept: calls,
  };
  render(<Dashboard api={api} />);
  fireEvent.click(screen.getByRole("button", { name: "Projeler / Görevler" }));
  return calls;
}

it("filters tasks by status with honest counts and per-project task totals", async () => {
  setup([
    task("1", "draft"),
    task("2", "draft"),
    task("3", "awaiting_review"),
    task("4", "draft", "p2"),
  ]);
  await screen.findByRole("heading", { name: "Görev 1" });
  const projects = screen.getByRole("navigation", { name: "Projeler" });
  expect(
    within(projects).getByRole("button", { name: /Birinci/ }).textContent,
  ).toContain("3 görev");
  expect(
    within(projects).getByRole("button", { name: /İkinci/ }).textContent,
  ).toContain("1 görev");

  const filter = screen.getByRole("group", { name: "Görev durumu süzgeci" });
  expect(within(filter).getByRole("button", { name: "Tümü · 3" })).toBeTruthy();
  fireEvent.click(within(filter).getByRole("button", { name: "Taslak · 2" }));
  expect(screen.queryByRole("heading", { name: "Görev 3" })).toBeNull();
  expect(
    screen.getAllByRole("heading", { level: 3, name: /^Görev/ }),
  ).toHaveLength(2);
  expect(
    within(filter)
      .getByRole("button", { name: "Taslak · 2" })
      .getAttribute("aria-pressed"),
  ).toBe("true");

  // Switching project drops a filter that has no tasks there instead of showing an empty list.
  fireEvent.click(
    within(filter).getByRole("button", { name: "İnceleme bekliyor · 1" }),
  );
  fireEvent.click(within(projects).getByRole("button", { name: /İkinci/ }));
  expect(await screen.findByRole("heading", { name: "Görev 4" })).toBeTruthy();
});

it("names each action after its task and shows what a human acceptance covers", async () => {
  const calls = setup([task("1", "awaiting_review"), task("2", "ready")]);
  await screen.findByRole("heading", { name: "Görev 1" });
  const accept = screen.getByRole("button", {
    name: "Teslimi kabul et: Görev 1",
  });
  expect(screen.getByText("Teslimi kabul et")).toBe(accept);
  expect(screen.getByText(`${hash.slice(0, 16)}…`)).toBeTruthy();
  expect(
    screen.getByText(/Revizyon\s+2\s*$/, { selector: ".hash" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "İptal et: Görev 2" }),
  ).toBeTruthy();
  expect(calls).not.toHaveBeenCalled();
});

it("explains why a ready task cannot run while another demo task is running", async () => {
  setup([task("1", "running"), task("2", "ready")]);
  await screen.findByRole("heading", { name: "Görev 2" });
  const run = screen.getByRole("button", {
    name: "Demo ajanını çalıştır: Görev 2",
  });
  expect((run as HTMLButtonElement).disabled).toBe(true);
  const note = run.getAttribute("aria-describedby");
  expect(note).toBeTruthy();
  expect(document.getElementById(note!)!.textContent).toContain(
    "Başka bir demo görev çalışıyor",
  );
});

it("keeps keyboard focus on the task field after adding a task", async () => {
  const calls = setup([task("1", "draft")]);
  await screen.findByRole("heading", { name: "Görev 1" });
  const input = screen.getByLabelText(
    "Yeni görevin hedefi",
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Yeni hedef" } });
  const add = screen.getByRole("button", { name: "Görev ekle" });
  add.focus();
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(calls).toHaveBeenCalled());
  expect(document.activeElement).toBe(input);
});

it("sends the quick action 'Yeni proje' to the project name field", async () => {
  const snapshot: Snapshot = {
    mode: "mock",
    projects: [],
    tasks: [],
    events: [],
  };
  const refuse = async () => snapshot;
  render(
    <Dashboard
      api={{
        snapshot: refuse,
        createProject: refuse,
        createTask: refuse,
        ready: refuse,
        run: refuse,
        cancel: refuse,
        accept: refuse,
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Yeni proje" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Yeni proje adı"),
    ),
  );
});
