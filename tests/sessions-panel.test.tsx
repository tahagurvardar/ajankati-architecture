// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionsPanel } from "../apps/desktop/renderer/SessionsPanel";
afterEach(cleanup);
it("explains the launch block and unknown cost without starting inference", async () => {
  const api = {
    list: vi
      .fn()
      .mockResolvedValue({
        capability: {
          provider: "codex",
          liveLaunch: false,
          protocol: "app-server/stdio",
          blockers: ["Süreç sahipliği doğrulanmadı."],
        },
        sessions: [],
      }),
    start: vi.fn(),
    interrupt: vi.fn(),
    terminate: vi.fn(),
  };
  render(<SessionsPanel api={api} />);
  await screen.findByText("Süreç sahipliği doğrulanmadı.");
  expect(screen.getByText("Henüz gerçek Codex oturumu yok.")).toBeTruthy();
  const button = screen.getByRole("button", { name: /oturumu başlat/ });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(api.start).not.toHaveBeenCalled();
  expect(
    screen.getByText(/Abonelik kotası API faturası değildir/),
  ).toBeTruthy();
});
