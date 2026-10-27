import { afterEach, expect, it } from "vitest";
import {
  TerminalHost,
  OutputBuffer,
  OUTPUT_LIMIT,
} from "../apps/worker/src/terminal-host";

const hosts: TerminalHost[] = [];
it.runIf(process.platform === "win32")(
  "forces cleanup of the owned diagnostic when it does not accept Ctrl+C",
  async () => {
    const host = new TerminalHost();
    hosts.push(host);
    const session = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    const sessionId = session.sessionId;
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor: 0 },
            })
          ).output,
        { timeout: 8000 },
      )
      .toContain("READY");
    await host.execute({
      method: "input",
      payload: { sessionId, data: ":hold\r" },
    });
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor: 0 },
            })
          ).output,
        { timeout: 3000 },
      )
      .toContain("HOLDING");
    expect(
      (await host.execute({ method: "close", payload: { sessionId } })).status,
    ).toBe("exited");
    expect(() => process.kill(session.pid, 0)).toThrow();
  },
  20000,
);
it.runIf(process.platform === "win32")(
  "bounds a real ConPTY flood and observes a normal zero exit",
  async () => {
    const host = new TerminalHost();
    hosts.push(host);
    const session = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    const sessionId = session.sessionId;
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor: 0 },
            })
          ).output,
        { timeout: 8000 },
      )
      .toContain("READY");
    await host.execute({
      method: "input",
      payload: { sessionId, data: ":flood\r" },
    });
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor: 0 },
            })
          ).dropped,
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    let cursor = 0;
    let tail = "";
    await expect
      .poll(
        async () => {
          const state = await host.execute({
            method: "read",
            payload: { sessionId, cursor },
          });
          expect(state.output.length).toBeLessThanOrEqual(8192);
          cursor = state.cursor;
          tail = (tail + state.output).slice(-100);
          return tail;
        },
        { timeout: 15000, interval: 10 },
      )
      .toContain("FLOOD-END");
    await host.execute({
      method: "input",
      payload: { sessionId, data: ":exit\r" },
    });
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor },
            })
          ).exitCode,
        { timeout: 5000 },
      )
      .toBe(0);
    expect(() => process.kill(session.pid, 0)).toThrow();
  },
  30000,
);
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.stop();
});
it("bounds retained output, reports loss, caps frames and preserves astral Unicode", () => {
  const buffer = new OutputBuffer();
  buffer.append("x".repeat(OUTPUT_LIMIT + 100));
  const first = buffer.read(0);
  expect(first.dropped).toBe(100);
  expect(first.output.length).toBe(8192);
  expect(() => buffer.read(OUTPUT_LIMIT + 101)).toThrow();
  const unicode = new OutputBuffer();
  unicode.append("x".repeat(8191) + "😀İ");
  const part = unicode.read(0);
  expect(part.output.length).toBe(8191);
  expect(unicode.read(part.cursor).output).toBe("😀İ");
});
it.runIf(process.platform === "win32")(
  "rejects input flooding, closes owned processes, and rejects stale sessions",
  async () => {
    const host = new TerminalHost();
    hosts.push(host);
    const first = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    for (let i = 0; i < 4; i++)
      await host.execute({
        method: "input",
        payload: { sessionId: first.sessionId, data: "x".repeat(4096) },
      });
    await expect(
      host.execute({
        method: "input",
        payload: { sessionId: first.sessionId, data: "x" },
      }),
    ).rejects.toThrow("hızı");
    expect(
      (
        await host.execute({
          method: "close",
          payload: { sessionId: first.sessionId },
        })
      ).status,
    ).toBe("exited");
    expect(() => process.kill(first.pid, 0)).toThrow();
    const second = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    expect(second.sessionId).not.toBe(first.sessionId);
    await expect(
      host.execute({
        method: "interrupt",
        payload: { sessionId: first.sessionId },
      }),
    ).rejects.toThrow();
    await host.stop();
    expect(() => process.kill(second.pid, 0)).toThrow();
    await expect(
      host.execute({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      }),
    ).rejects.toThrow();
  },
  20000,
);
it.runIf(process.platform === "win32")(
  "runs genuine ConPTY with Turkish input, Windows paths, resize, interruption and exit",
  async () => {
    const host = new TerminalHost();
    hosts.push(host);
    const started = await host.execute({
      method: "start",
      payload: { profile: "safe-echo", cols: 80, rows: 24 },
    });
    const sessionId = started.sessionId;
    let cursor = 0;
    let output = "";
    async function until(text: string) {
      await expect
        .poll(
          async () => {
            const state = await host.execute({
              method: "read",
              payload: { sessionId, cursor },
            });
            cursor = state.cursor;
            output += state.output;
            return output;
          },
          { timeout: 8000 },
        )
        .toContain(text);
    }
    await until("READY");
    await host.execute({
      method: "input",
      payload: {
        sessionId,
        data: "İıŞşĞğÜüÖöÇç C:\\Türkçe yol\\dosya & | > < ^ % !\r",
      },
    });
    await until("ECHO:İıŞşĞğÜüÖöÇç C:\\Türkçe yol\\dosya & | > < ^ % !");
    await host.execute({
      method: "resize",
      payload: { sessionId, cols: 100, rows: 30 },
    });
    await host.execute({
      method: "input",
      payload: { sessionId, data: ":size\r" },
    });
    await until("SIZE:100x30");
    await expect(
      host.execute({
        method: "input",
        payload: {
          sessionId: "00000000-0000-4000-8000-000000000000",
          data: "bad",
        },
      }),
    ).rejects.toThrow();
    await expect(
      host.execute({
        method: "start",
        payload: { profile: "safe-echo", cols: 80, rows: 24 },
      }),
    ).rejects.toThrow();
    await host.execute({ method: "interrupt", payload: { sessionId } });
    await until("INTERRUPTED");
    await expect
      .poll(
        async () =>
          (
            await host.execute({
              method: "read",
              payload: { sessionId, cursor },
            })
          ).status,
        { timeout: 5000 },
      )
      .toBe("exited");
  },
  20000,
);
