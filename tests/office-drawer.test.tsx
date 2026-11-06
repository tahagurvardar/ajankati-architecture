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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dashboard } from "../apps/desktop/renderer/Dashboard";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import type {
  AgentApi,
  DesktopApi,
  Snapshot,
} from "../packages/contracts/src/index";

afterEach(cleanup);

const empty: Snapshot = { mode: "mock", projects: [], tasks: [], events: [] };
const refuse = async () => {
  throw new Error("Unexpected mutation");
};
function desktopApi(snapshot: Snapshot = empty): DesktopApi {
  return {
    snapshot: async () => snapshot,
    createProject: refuse,
    createTask: refuse,
    ready: refuse,
    run: refuse,
    cancel: refuse,
    accept: refuse,
  };
}
function spyAgentApi(registry: AgentRegistry) {
  const api = {
    list: vi.fn(() => registry.execute({ method: "list", payload: {} })),
    discover: vi.fn(() =>
      registry.execute({ method: "discover", payload: {} }),
    ),
    verify: vi.fn((integrationId, approvalToken) =>
      registry.execute({
        method: "verify",
        payload: { integrationId, approvalToken, approved: true },
      }),
    ),
  } satisfies AgentApi;
  return api;
}
const openDrawer = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

it("opens an accessible agent dialog from a hotspot and restores focus on Escape", async () => {
  const agents = spyAgentApi(
    new AgentRegistry({ directories: [], platform: "win32", probe: vi.fn() }),
  );
  render(<Dashboard api={desktopApi()} agentApi={agents} />);
  const hotspot = screen.getByRole("button", {
    name: "Claude Code ayrıntılarını aç",
  });
  hotspot.focus();
  fireEvent.click(hotspot);
  const dialog = await screen.findByRole("dialog", { name: /Claude Code/ });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const close = within(dialog).getByRole("button", {
    name: "Ajan ayrıntılarını kapat",
  });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(hotspot);
  // Backdrop click closes as well.
  fireEvent.click(hotspot);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByTestId("drawer-backdrop"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps Tab focus inside the open dialog", async () => {
  render(<Dashboard api={desktopApi()} />);
  openDrawer("Codex CLI ayrıntılarını aç");
  const dialog = await screen.findByRole("dialog");
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"),
  );
  expect(focusable.length).toBeGreaterThan(1);
  focusable.at(-1)!.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(document.activeElement).toBe(focusable[0]);
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(focusable.at(-1));
});

it("shows only worker-reported facts and never starts, discovers or verifies anything", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ajan-drawer-"));
  try {
    writeFileSync(join(dir, "claude.exe"), "fixture");
    const probe = vi.fn(async () => ({
      output: "2.1.296 (Claude Code)",
      error: null,
    }));
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe,
    });
    await registry.execute({ method: "discover", payload: {} });
    const row = (await registry.execute({ method: "list", payload: {} }))
      .integrations[0]!;
    await registry.execute({
      method: "verify",
      payload: {
        integrationId: "claude-code",
        approvalToken: row.approvalToken!,
        approved: true,
      },
    });
    expect(probe).toHaveBeenCalledTimes(1);
    const agents = spyAgentApi(registry);
    render(<Dashboard api={desktopApi()} agentApi={agents} />);
    await waitFor(() => expect(agents.list).toHaveBeenCalled());

    openDrawer("Claude Code ayrıntılarını aç");
    let dialog = await screen.findByRole("dialog", { name: /Claude Code/ });
    await within(dialog).findByText("2.1.296");
    expect(dialog.textContent).toContain("Yalnız sürüm doğrulandı");
    expect(dialog.textContent).toContain("Etkin değil");
    expect(
      within(dialog).getByText("Aktif görev").nextSibling?.textContent,
    ).toBe("Yok — gerçek görev başlatılmaz");
    expect(dialog.textContent).toContain("Gerçek ajan terminali");
    expect(dialog.textContent).not.toMatch(/55\/55|Çalışıyor/);
    const terminal = within(dialog).getByRole("button", {
      name: /Canlı ajan terminali/,
    }) as HTMLButtonElement;
    expect(terminal.disabled).toBe(true);
    fireEvent.click(terminal);
    fireEvent.keyDown(dialog, { key: "Escape" });

    // Codex was searched for and not found: no version is invented.
    openDrawer("Codex CLI ayrıntılarını aç");
    dialog = await screen.findByRole("dialog", { name: /Codex CLI/ });
    expect(dialog.textContent).toContain("Bulunamadı");
    expect(dialog.textContent).not.toContain("Yalnız sürüm doğrulandı");
    expect(within(dialog).getByText("Sürüm").nextSibling?.textContent).toBe(
      "Bilinmiyor",
    );
    fireEvent.keyDown(dialog, { key: "Escape" });

    // Design-only roles are not presented as agents.
    openDrawer("Test / QA Rolü ayrıntılarını aç");
    dialog = await screen.findByRole("dialog", { name: /Test \/ QA/ });
    expect(dialog.textContent).toContain("Tasarım rolü · bağlı ajan yok");
    expect(dialog.textContent).not.toContain("Yalnız sürüm doğrulandı");

    expect(agents.discover).not.toHaveBeenCalled();
    expect(agents.verify).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("stays usable and honest when the agent inventory cannot be read", async () => {
  const agents: AgentApi = {
    list: vi.fn(async () => {
      throw new Error("offline");
    }),
    discover: vi.fn(),
    verify: vi.fn(),
  };
  render(<Dashboard api={desktopApi()} agentApi={agents} />);
  openDrawer("Claude Code ayrıntılarını aç");
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(dialog.textContent).toContain("Ajan kaydı alınamadı"),
  );
  expect(dialog.textContent).not.toContain("Yalnız sürüm doğrulandı");
});

it("opens the same dialog from Panel Görünümü agent cards and routes to Ajanlar", async () => {
  render(<Dashboard api={desktopApi()} agents={<p>ajan ekranı</p>} />);
  fireEvent.click(screen.getByRole("button", { name: "Panel Görünümü" }));
  const inventory = screen.getByRole("region", { name: "Ajan envanteri" });
  expect(
    within(inventory).getAllByRole("button", { name: /ayrıntıları$/ }),
  ).toHaveLength(4);
  fireEvent.click(
    within(inventory).getByRole("button", { name: "Claude Code ayrıntıları" }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Ajanlar ekranını aç" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Ajanlar" })
      .getAttribute("aria-current"),
  ).toBe("page");
});

it("focuses search with Ctrl+K and navigates to matching local projects and tasks", async () => {
  const snapshot: Snapshot = {
    mode: "mock",
    projects: [{ id: "p1", name: "Restoran sitesi", createdAt: "2026-11-01" }],
    tasks: [
      {
        id: "t1",
        projectId: "p1",
        title: "Rezervasyon formu",
        status: "draft",
        revision: 0,
        createdAt: "2026-11-01",
        updatedAt: "2026-11-01",
        runId: null,
        result: null,
        resultHash: null,
        executionMode: "mock",
      },
    ],
    events: [],
  };
  render(<Dashboard api={desktopApi(snapshot)} />);
  await waitFor(() =>
    expect(
      screen.getAllByText("1", { selector: ".metrics strong" }),
    ).toHaveLength(2),
  );
  const search = screen.getByRole("searchbox", { name: "Ara" });
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "rezerv" } });
  fireEvent.click(
    await screen.findByRole("button", { name: /Rezervasyon formu/ }),
  );
  expect(
    screen
      .getByRole("button", { name: "Projeler / Görevler" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect((search as HTMLInputElement).value).toBe("");
  fireEvent.change(search, { target: { value: "yok böyle bir şey" } });
  expect(await screen.findByText("Eşleşen yerel kayıt yok.")).toBeTruthy();
});

it("toggles the focus (enlarged office) mode and leaves it with Escape", () => {
  render(<Dashboard api={desktopApi()} />);
  const toggle = screen.getByRole("button", { name: "Ofisi büyüt" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(toggle);
  expect(document.querySelector(".shell")!.classList.contains("focus")).toBe(
    true,
  );
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.querySelector(".shell")!.classList.contains("focus")).toBe(
    false,
  );
});

it("summarises real snapshot events, never invented activity", async () => {
  const snapshot: Snapshot = {
    mode: "mock",
    projects: [{ id: "p1", name: "Gerçek proje", createdAt: "2026-11-01" }],
    tasks: [],
    events: [
      {
        sequence: 1,
        entityId: "p1",
        kind: "project.created",
        occurredAt: "2026-11-01T09:00:00.000Z",
      },
    ],
  };
  render(<Dashboard api={desktopApi(snapshot)} />);
  const activity = await screen.findByRole("region", {
    name: "Son aktiviteler",
  });
  await waitFor(() =>
    expect(activity.textContent).toContain("Proje oluşturuldu"),
  );
  expect(activity.textContent).toContain("Gerçek proje");
  cleanup();
  render(<Dashboard api={desktopApi()} />);
  const none = await screen.findByRole("region", { name: "Son aktiviteler" });
  await waitFor(() =>
    expect(none.textContent).toContain("Henüz kayıtlı etkinlik yok"),
  );
});
