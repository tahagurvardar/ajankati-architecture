// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentsPanel } from "../apps/desktop/renderer/AgentsPanel";
import { AgentRegistry } from "../apps/worker/src/agent-registry";
afterEach(cleanup);
it("shows actual discovery and requires an explicit version click, with no connected fiction", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ajan-ui-"));
  try {
    writeFileSync(join(dir, "claude.exe"), "fixture");
    let launches = 0;
    const registry = new AgentRegistry({
      directories: [dir],
      platform: "win32",
      probe: async () => {
        launches++;
        return { output: "2.1.296 (Claude Code)", error: null };
      },
    });
    render(
      <AgentsPanel
        api={{
          list: () => registry.execute({ method: "list", payload: {} }),
          discover: () => registry.execute({ method: "discover", payload: {} }),
          verify: (integrationId, approvalToken) =>
            registry.execute({
              method: "verify",
              payload: { integrationId, approvalToken, approved: true },
            }),
        }}
      />,
    );
    await screen.findByText("Claude Code");
    expect(launches).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "CLI’leri keşfet" }));
    const approve = await screen.findByRole("button", {
      name: "Claude Code: --version çalıştırmayı onayla",
    });
    expect(launches).toBe(0);
    expect(
      screen.queryByRole("button", {
        name: "Codex CLI: --version çalıştırmayı onayla",
      }),
    ).toBeNull();
    fireEvent.click(approve);
    await screen.findByText("2.1.296");
    await waitFor(() => expect(launches).toBe(1));
    expect(
      screen.getByText("Bulundu · Yalnız sürüm doğrulandı · Etkin değil"),
    ).toBeTruthy();
    expect(
      screen.getByText("CLI sınırlı yerel PATH aramasında bulunamadı."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "CLI’leri keşfet" }));
    await screen.findByRole("button", {
      name: "Claude Code: --version çalıştırmayı onayla",
    });
    expect(screen.queryByText("2.1.296")).toBeNull();
    expect(
      screen.getByText("Bulundu · Doğrulanmadı · Etkin değil"),
    ).toBeTruthy();
    expect(launches).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
