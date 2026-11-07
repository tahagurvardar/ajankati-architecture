// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Dashboard } from "../apps/desktop/renderer/Dashboard";
import { shortenPath } from "../apps/desktop/renderer/pathDisplay";
import {
  capabilityInfo,
  capabilityLabel,
} from "../apps/desktop/renderer/agentView";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
import type {
  AgentApi,
  AgentRecord,
  DesktopApi,
  Snapshot,
} from "../packages/contracts/src/index";

const empty: Snapshot = { mode: "mock", projects: [], tasks: [], events: [] };
const refuse = async () => {
  throw new Error("Unexpected mutation");
};
const api: DesktopApi = {
  snapshot: async () => empty,
  createProject: refuse,
  createTask: refuse,
  ready: refuse,
  run: refuse,
  cancel: refuse,
  accept: refuse,
};
const css = (name: string) =>
  readFileSync(join("apps/desktop/renderer", name), "utf8");

const root = document.documentElement;
const scrollTo = vi.fn();
let scrollY = 420;
const cleanups: Array<() => void> = [];
const dirs: string[] = [];

beforeEach(() => {
  scrollTo.mockClear();
  scrollY = 420;
  vi.stubGlobal("scrollTo", scrollTo);
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    get: () => window.innerWidth - 15,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const undo of cleanups.splice(0)) undo();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
  root.removeAttribute("style");
  document.body.removeAttribute("style");
});

/** A worker-shaped record whose executable path is long, discovered for real. */
async function longPathRecord(): Promise<{
  record: AgentRecord;
  path: string;
}> {
  const dir = mkdtempSync(join(tmpdir(), "ajan-polish-"));
  dirs.push(dir);
  const nested = join(dir, "çok uzun klasör adı", "bin", "claude-code-native");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, "claude.exe"), "fixture");
  const registry = new AgentRegistry({
    directories: [nested],
    platform: "win32",
    probe: vi.fn(async () => ({
      output: "2.1.296 (Claude Code)",
      error: null,
    })),
  });
  await registry.execute({ method: "discover", payload: {} });
  const found = (await registry.execute({ method: "list", payload: {} }))
    .integrations[0]!;
  await registry.execute({
    method: "verify",
    payload: {
      integrationId: "claude-code",
      approvalToken: found.approvalToken!,
      approved: true,
    },
  });
  const record = (await registry.execute({ method: "list", payload: {} }))
    .integrations[0]!;
  return { record, path: record.executable!.path };
}
function agentsWith(record: AgentRecord): AgentApi {
  const list = vi.fn(async () => ({
    integrations: [record],
  })) as unknown as AgentApi["list"];
  return { list, discover: vi.fn(), verify: vi.fn() };
}
const claudeSpot = () =>
  screen.getByRole("button", { name: "Claude Code ayrıntılarını aç" });
async function openClaude(agents?: AgentApi) {
  render(<Dashboard api={api} agentApi={agents} />);
  const hotspot = claudeSpot();
  hotspot.focus();
  fireEvent.click(hotspot);
  const dialog = await screen.findByRole("dialog", { name: /Claude Code/ });
  return { hotspot, dialog };
}

it("locks the page scroller while the drawer is open and restores it exactly", async () => {
  const { dialog } = await openClaude();
  expect(root.style.overflow).toBe("hidden");
  // The scrollbar width is re-added so the page does not shift sideways.
  expect(document.body.style.paddingRight).toBe("15px");
  // Position drifts while locked: it is put back on close.
  scrollY = 0;
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(root.style.overflow).toBe("");
  expect(document.body.style.paddingRight).toBe("");
  expect(scrollTo).toHaveBeenCalledWith(0, 420);
});

it("does not touch scroll position when it never moved, and survives repeated cycles", async () => {
  render(<Dashboard api={api} />);
  for (let cycle = 0; cycle < 6; cycle++) {
    fireEvent.click(claudeSpot());
    const dialog = await screen.findByRole("dialog");
    expect(root.style.overflow).toBe("hidden");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(root.style.overflow).toBe("");
    expect(document.body.style.paddingRight).toBe("");
    expect(document.activeElement).toBe(claudeSpot());
  }
  expect(scrollTo).not.toHaveBeenCalled();
});

it("releases the lock when the dialog unmounts without Escape (backdrop, navigation, teardown)", async () => {
  const { unmount } = render(<Dashboard api={api} agents={<p>x</p>} />);
  fireEvent.click(claudeSpot());
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByTestId("drawer-backdrop"));
  expect(root.style.overflow).toBe("");
  fireEvent.click(claudeSpot());
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Ajanlar ekranını aç" }));
  expect(root.style.overflow).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Genel Bakış" }));
  fireEvent.click(claudeSpot());
  await screen.findByRole("dialog");
  unmount();
  expect(root.style.overflow).toBe("");
  expect(document.body.style.paddingRight).toBe("");
});

it("scrolls only the drawer body and does not chain to the page (CSS contract)", () => {
  const sheet = css("overview.css");
  const body = /\.drawer-main \{[^}]*\}/.exec(sheet)![0];
  expect(body).toContain("overflow-y: auto");
  expect(body).toContain("overscroll-behavior: contain");
  expect(body).toContain("min-height: 0");
  const shell = /\.agent-drawer \{[^}]*\}/.exec(sheet)![0];
  expect(shell).toContain("overscroll-behavior: contain");
  // The header is outside the scroller so Close is always reachable.
  expect(/\.drawer-top \{[^}]*\}/.exec(sheet)![0]).toContain("flex: none");
});

it("traps Tab in both directions (incl. new controls) and keeps Escape working across reopenings", async () => {
  const { record } = await longPathRecord();
  render(<Dashboard api={api} agentApi={agentsWith(record)} />);
  for (let cycle = 0; cycle < 3; cycle++) {
    const hotspot = claudeSpot();
    hotspot.focus();
    fireEvent.click(hotspot);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("2.1.296");
    const stops = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], textarea:not([hidden])",
      ),
    );
    const names = stops.map((el) => el.textContent);
    expect(names).toContain("Tam yolu göster");
    expect(names).toContain("Yolu kopyala");
    stops.at(-1)!.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(stops[0]);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(stops.at(-1));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(hotspot);
  }
});

it("shortens long Windows, UNC and POSIX paths without losing the file or the root", () => {
  const win =
    "C:\\Users\\tahag\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
  const short = shortenPath(win);
  expect(short.length).toBeLessThan(win.length);
  expect(short.startsWith("C:\\…\\")).toBe(true);
  expect(short.endsWith("bin\\claude.exe")).toBe(true);
  expect(shortenPath("C:\\tools\\claude.exe")).toBe("C:\\tools\\claude.exe");
  const unc =
    "\\\\build-server\\share\\team\\tools\\agents\\native\\codex\\codex.exe";
  expect(shortenPath(unc).startsWith("\\\\build-server\\share\\…\\")).toBe(
    true,
  );
  expect(shortenPath(unc).endsWith("codex\\codex.exe")).toBe(true);
  const posix = "/opt/very/long/vendor/directory/structure/agents/codex";
  expect(shortenPath(posix, 30).startsWith("/…/")).toBe(true);
  expect(shortenPath(posix, 30).endsWith("agents/codex")).toBe(true);
});

it("shows the shortened path, keeps the exact full path inspectable, and never copies on its own", async () => {
  const { record, path } = await longPathRecord();
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const { dialog } = await openClaude(agentsWith(record));
  await within(dialog).findByText("2.1.296");
  const short = dialog.querySelector(".path-short")!;
  expect(short.textContent).toBe(shortenPath(path));
  expect(short.textContent).not.toBe(path);
  expect(short.getAttribute("title")).toBe(path);
  const full = within(dialog).getByLabelText(
    "Tam yürütülebilir dosya yolu",
  ) as HTMLTextAreaElement;
  expect(full.hidden).toBe(true);
  const toggle = within(dialog).getByRole("button", {
    name: "Tam yolu göster",
  });
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(full.hidden).toBe(false);
  expect(full.value).toBe(path);
  expect(full.readOnly).toBe(true);
  expect(writeText).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Yolu kopyala" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(path));
  expect(writeText).toHaveBeenCalledTimes(1);
  await within(dialog).findByText("Yol panoya kopyalandı.");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("falls back to legacy copy, then to selectable text, when the Clipboard API fails", async () => {
  const { record, path } = await longPathRecord();
  const exec = vi.fn(() => true);
  (document as unknown as { execCommand: typeof exec }).execCommand = exec;
  cleanups.push(() => {
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    },
  });
  const { dialog } = await openClaude(agentsWith(record));
  await within(dialog).findByText("2.1.296");
  fireEvent.click(within(dialog).getByRole("button", { name: "Yolu kopyala" }));
  await within(dialog).findByText("Yol panoya kopyalandı.");
  expect(exec).toHaveBeenCalledWith("copy");
  expect(document.querySelector(".path-offscreen")).toBeNull();

  // Everything fails: no Clipboard API at all and execCommand refuses.
  exec.mockReturnValue(false);
  vi.stubGlobal("navigator", {});
  fireEvent.click(within(dialog).getByRole("button", { name: "Yolu kopyala" }));
  const status = await within(dialog).findByText(/Pano kullanılamadı/);
  expect(status.textContent).toContain("Ctrl+C");
  const full = within(dialog).getByLabelText(
    "Tam yürütülebilir dosya yolu",
  ) as HTMLTextAreaElement;
  expect(full.hidden).toBe(false);
  expect(full.value).toBe(path);
  expect(document.activeElement).toBe(full);
  expect(full.selectionStart).toBe(0);
  expect(full.selectionEnd).toBe(path.length);
  // The dialog is still fully operable.
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("collapses capability details by default, toggles them, and labels states in text", async () => {
  const { record } = await longPathRecord();
  const { dialog } = await openClaude(agentsWith(record));
  await within(dialog).findByText("2.1.296");
  const toggle = within(dialog).getByRole("button", {
    name: /Ayrıntıları göster/,
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toMatch(/\d+ doğrulandı · \d+ bilinmiyor/);
  const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(list.hidden).toBe(true);
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(list.hidden).toBe(false);
  expect(within(dialog).getByText("İptal")).toBeTruthy();
  // Verified and unknown are told apart by words, not only colour.
  expect(list.textContent).toContain("Doğrulandı");
  expect(list.textContent).toContain("Bilinmiyor · henüz doğrulanmadı");
  expect(list.querySelector(".cap-verified")).toBeTruthy();
  expect(list.querySelector(".cap-unknown")).toBeTruthy();
  fireEvent.click(toggle);
  expect(list.hidden).toBe(true);
});

it("never renders a blank or 'verified' label for capabilities it does not recognise", async () => {
  expect(capabilityLabel("versionCheck")).toBe("Sürüm kontrolü");
  expect(capabilityLabel("telepathy")).toBe("Bilinmeyen yetenek (telepathy)");
  expect(capabilityInfo("maybe").state).toBe("unknown");
  expect(capabilityInfo(undefined).state).toBe("unknown");
  expect(capabilityInfo("verified").symbol).toBe("✓");
  const { record } = await longPathRecord();
  const odd = {
    ...record,
    capabilities: { ...record.capabilities, telepathy: "maybe" },
  } as unknown as AgentRecord;
  const { dialog } = await openClaude(agentsWith(odd));
  await within(dialog).findByText("2.1.296");
  fireEvent.click(
    within(dialog).getByRole("button", { name: /Ayrıntıları göster/ }),
  );
  const row = within(dialog).getByText(
    "Bilinmeyen yetenek (telepathy)",
  ).parentElement!;
  expect(row.className).toBe("cap-unknown");
  expect(row.textContent).toContain("Bilinmiyor");
  expect(dialog.textContent).not.toMatch(/undefined/);
});

it("explains the unavailable terminal and styles it as disabled, not as a faded primary button", async () => {
  const { dialog } = await openClaude();
  const terminal = within(dialog).getByRole("button", {
    name: "Canlı ajan terminali",
  }) as HTMLButtonElement;
  expect(terminal.disabled).toBe(true);
  const reason = document.getElementById(
    terminal.getAttribute("aria-describedby")!,
  )!;
  expect(reason.textContent).toContain("Henüz kullanılamıyor");
  expect(reason.textContent).toContain("süreç sahipliği");
  const rule = /\.unavailable button:disabled \{[^}]*\}/.exec(
    css("overview.css"),
  )![0];
  expect(rule).toContain("opacity: 1");
  expect(rule).toContain("cursor: not-allowed");
  const headings = within(dialog)
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent);
  expect(headings).toEqual(
    expect.arrayContaining(["Çalışma durumu", "Sonraki adım"]),
  );
});

it("gives Claude and Codex the same section structure", async () => {
  const { record } = await longPathRecord();
  const headingsFor = async (name: string) => {
    render(<Dashboard api={api} agentApi={agentsWith(record)} />);
    fireEvent.click(screen.getByRole("button", { name }));
    const dialog = await screen.findByRole("dialog");
    const headings = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    cleanup();
    return headings;
  };
  const claude = await headingsFor("Claude Code ayrıntılarını aç");
  const codex = await headingsFor("Codex CLI ayrıntılarını aç");
  // Codex has no record in this fixture and shows only the shared sections.
  expect(claude).toEqual(expect.arrayContaining(codex));
  expect(codex).toEqual(
    expect.arrayContaining(["Çalışma durumu", "Sonraki adım"]),
  );
});

it("keeps only four interactive office targets and invents no active agents", async () => {
  const { record } = await longPathRecord();
  render(<Dashboard api={api} agentApi={agentsWith(record)} />);
  await waitFor(() =>
    expect(
      screen.getByText("CLI sürümü doğrulandı").previousSibling!.textContent,
    ).toBe("1"),
  );
  const spots = Array.from(document.querySelectorAll<HTMLElement>(".hotspot"));
  expect(spots.map((s) => s.dataset.agent).sort()).toEqual([
    "claude",
    "codex",
    "research",
    "tester",
  ]);
  // Baked-in characters ("Analizci", "Raporcu", Kat 1/2/Zemin) have no control.
  const scene = document.querySelector<HTMLElement>(".office-scene")!;
  expect(scene.querySelectorAll("button")).toHaveLength(4);
  expect(scene.querySelector("figcaption")!.textContent).toContain(
    "statik görselin parçasıdır; tıklanmaz",
  );
  expect(scene.querySelector("img")!.getAttribute("alt")).toContain(
    "Gerçek ajan durumu göstermez",
  );
  expect(
    screen.getByText("Çalışan gerçek ajan", { selector: ".metrics span" })
      .previousSibling!.textContent,
  ).toBe("0");
  expect(document.body.textContent).not.toMatch(
    /Çalışıyor|Online|Çevrimiçi|55\/55/,
  );
  expect(/\.hotspot[^{]*\{[^}]*animation/.test(css("overview.css"))).toBe(
    false,
  );
});

it("hotspot hover/focus feedback is CSS-only, keyboard-visible and anchored on the characters", () => {
  const sheet = css("overview.css");
  expect(sheet).toMatch(/\.hotspot:focus-visible \.hotspot-label/);
  expect(sheet).toMatch(/\.hotspot:hover \.hotspot-label/);
  expect(/\.hotspot \{[^}]*translate: -50% -50%/.test(sheet)).toBe(true);
  // Centre points measured on the approved 2000x932 scene (see UI-SPRINT-2-1.md).
  const expected = {
    claude: [16.5, 51],
    codex: [46.7, 53],
    research: [55.5, 30.5],
    tester: [64.3, 76.5],
  } as const;
  for (const [agent, [left, top]] of Object.entries(expected)) {
    const rule = new RegExp(
      `\\.hotspot\\[data-agent="${agent}"\\] \\{([^}]*)\\}`,
    ).exec(sheet)![1]!;
    expect(parseFloat(/left: ([\d.]+)%/.exec(rule)![1]!)).toBeCloseTo(left, 1);
    expect(parseFloat(/top: ([\d.]+)%/.exec(rule)![1]!)).toBeCloseTo(top, 1);
  }
});

it("keeps the drawer and long paths from forcing horizontal overflow (CSS contract)", () => {
  const sheet = css("overview.css");
  const shell = /\.agent-drawer \{[^}]*\}/.exec(sheet)![0];
  expect(shell).toMatch(/width: clamp\(360px, 32vw, 480px\)/);
  expect(shell).toContain("max-width: 100vw");
  expect(shell).toContain("height: 100dvh");
  for (const selector of [".path-short", ".path-full", ".drawer-facts dd"]) {
    const rule = new RegExp(
      `${selector.replace(/[.]/g, "\\.")} \\{[^}]*overflow-wrap: anywhere`,
    );
    expect(rule.test(sheet), selector).toBe(true);
  }
  expect(sheet).toMatch(/\.path-full \{[^}]*width: 100%/);
});
