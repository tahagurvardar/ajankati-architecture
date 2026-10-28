import { it, expect } from "vitest";
import type { CodexTransport } from "../apps/worker/src/codex-session";
import { initializeOnly } from "../apps/worker/src/codex-handshake";

function fixture(response: Buffer, cleaned = true) {
  const sent: string[] = [];
  let data!: (chunk: Buffer) => void;
  let exited!: () => void;
  const transport: CodexTransport & { drain(): Promise<void> } = {
    subscribe(onData, onExit) {
      data = onData;
      exited = onExit;
      return () => {};
    },
    write(line) {
      sent.push(JSON.parse(line).method);
      if (sent.length === 1)
        queueMicrotask(() => {
          data(response);
          exited();
        });
    },
    async drain() {},
    async terminate() {
      return cleaned;
    },
  };
  return { transport, sent };
}
it("sends only initialize/initialized and requires proven cleanup", async () => {
  const { transport, sent } = fixture(
    Buffer.from('{"id":1,"result":{"userAgent":"fixture"}}\n'),
  );
  await expect(initializeOnly(transport)).resolves.toEqual({
    initialized: true,
    cleaned: true,
  });
  expect(sent).toEqual(["initialize", "initialized"]);
});
it.each([
  Buffer.from([255, 10]),
  Buffer.from("{"),
  Buffer.alloc(262145, 65),
  Buffer.from('{"id":1,"error":{"code":-1}}\n'),
  Buffer.from('{"id":2,"method":"execCommandApproval","params":{}}\n'),
])(
  "rejects malformed, partial, oversized or server-request input",
  async (response) => {
    const { transport, sent } = fixture(response);
    await expect(initializeOnly(transport)).rejects.toThrow();
    expect(sent).toEqual(["initialize"]);
  },
);
it("does not report handshake success when cleanup is unproven", async () => {
  const { transport } = fixture(
    Buffer.from('{"id":1,"result":{"userAgent":"fixture"}}\n'),
    false,
  );
  await expect(initializeOnly(transport)).rejects.toThrow("CLEANUP_FAILED");
});
