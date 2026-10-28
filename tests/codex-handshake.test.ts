import { it, expect, vi } from "vitest";
import type { CodexTransport } from "../apps/worker/src/codex-session";
import { initializeOnly } from "../apps/worker/src/codex-handshake";

function fixture(response: Buffer | Buffer[], cleaned = true, exit = false) {
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
          for (const chunk of Array.isArray(response) ? response : [response])
            data(chunk);
          if (exit) exited();
        });
    },
    async drain() {},
    async terminate() {
      return cleaned;
    },
  };
  return {
    transport,
    sent,
    emitExit: () => exited(),
    emitData: (chunk: Buffer) => data(chunk),
  };
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
    const { transport, sent } = fixture(response, true, true);
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

const reply = '{"id":1,"result":{"userAgent":"fixture"}}\n';
const warning = '{"method":"warning","params":{"message":"Türkçe fixture"}}\n';
it.each([
  { chunks: [Buffer.from(warning + reply)] },
  { chunks: [...Buffer.from(warning + reply)].map((b) => Buffer.from([b])) },
])(
  "accepts bounded startup notifications and initialize across chunk boundaries",
  async ({ chunks }) => {
    const { transport, sent } = fixture(chunks);
    await expect(initializeOnly(transport)).resolves.toEqual({
      initialized: true,
      cleaned: true,
    });
    expect(sent).toEqual(["initialize", "initialized"]);
  },
);
it.each([
  [Buffer.from([255, 10]), "INVALID_UTF8"],
  [Buffer.from("bad\n"), "INVALID_JSON"],
  [
    Buffer.from('{"id":2,"method":"execCommandApproval","params":{}}\n'),
    "UNEXPECTED_REQUEST",
  ],
  [
    Buffer.from('{"id":1,"error":{"code":-1,"message":"private"}}\n'),
    "INITIALIZE_REJECTED",
  ],
  [Buffer.from("{"), "PARTIAL_FRAME"],
  [Buffer.alloc(0), "PROCESS_EXIT"],
] as const)("preserves first failure through exit", async (bytes, code) => {
  const { transport } = fixture(bytes, true, true);
  await expect(initializeOnly(transport)).rejects.toThrow(code);
});
it("rejects trailing partial input even after initialize response", async () => {
  const { transport } = fixture(Buffer.from(reply + "{"), true, true);
  await expect(initializeOnly(transport)).rejects.toThrow("PARTIAL_FRAME");
});

it.each([
  [reply + warning, undefined],
  [reply + reply, "UNEXPECTED_MESSAGE"],
  [warning.repeat(65), "MESSAGE_LIMIT"],
  [
    '{"method":"warning","id":2,"params":{"message":"fixture"}}\n' + reply,
    "UNEXPECTED_REQUEST",
  ],
  ['{"method":"unknown","params":{}}\n' + reply, "UNEXPECTED_MESSAGE"],
  [
    '{"method":"warning","params":{"message":"fixture","threadId":"thread"}}\n' +
      reply,
    "UNEXPECTED_MESSAGE",
  ],
] as const)(
  "keeps the initialize-only message allowlist",
  async (bytes, code) => {
    const { transport } = fixture(Buffer.from(bytes));
    if (code) await expect(initializeOnly(transport)).rejects.toThrow(code);
    else
      await expect(initializeOnly(transport)).resolves.toMatchObject({
        initialized: true,
      });
  },
);

it("times out a silent or indefinitely partial provider without retry", async () => {
  vi.useFakeTimers();
  try {
    const { transport, sent } = fixture(Buffer.from("{"));
    const result = expect(initializeOnly(transport)).rejects.toThrow(
      "HANDSHAKE_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(sent).toEqual(["initialize"]);
  } finally {
    vi.useRealTimers();
  }
});

it("accepts the native 0.164.0 response metadata without retaining it", async () => {
  const { transport } = fixture(
    Buffer.from(
      JSON.stringify({
        id: 1,
        result: {
          userAgent: "fixture",
          codexHome: "C:\\synthetic",
          platformFamily: "windows",
          platformOs: "windows",
        },
      }) + "\r\n",
    ),
  );
  await expect(initializeOnly(transport)).resolves.toEqual({
    initialized: true,
    cleaned: true,
  });
});

it("does not relabel malformed complete JSON as partial during cleanup", async () => {
  const { transport, emitExit } = fixture(Buffer.from("{invalid}\n"));
  transport.terminate = async () => {
    emitExit();
    return true;
  };
  await expect(initializeOnly(transport)).rejects.toThrow("INVALID_JSON");
});

it("rejects a server request arriving during cleanup after initialized was written", async () => {
  const { transport, emitData, emitExit } = fixture(Buffer.from(reply));
  transport.terminate = async () => {
    emitData(Buffer.from('{"id":2,"method":"item/tool/call","params":{}}\n'));
    emitExit();
    return true;
  };
  await expect(initializeOnly(transport)).rejects.toThrow("UNEXPECTED_REQUEST");
});
