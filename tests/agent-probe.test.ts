import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { runVersion } from "../apps/worker/src/agent-registry";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function child() {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValue(
    process as unknown as ReturnType<typeof spawn>,
  );
  return process;
}
describe("bounded fixed version subprocess", () => {
  it("times out, kills its child, and resolves even when close never arrives", async () => {
    vi.useFakeTimers();
    const proc = child();
    const result = runVersion("C:\\tools\\codex.exe", "C:\\tools");
    await vi.advanceTimersByTimeAsync(4500);
    expect(await result).toEqual({ output: "", error: "TIMEOUT" });
    expect(proc.kill).toHaveBeenCalledOnce();
  });
  it("limits combined stdout/stderr and never returns raw failed output", async () => {
    vi.useFakeTimers();
    const proc = child();
    const result = runVersion("C:\\tools\\codex.exe", "C:\\tools");
    proc.stderr.write("sensitive".repeat(600));
    proc.emit("close", 1);
    expect(await result).toEqual({ output: "", error: "OUTPUT_LIMIT" });
    expect(proc.kill).toHaveBeenCalledOnce();
  });
  it("uses only --version, no shell, no stdin, no inherited secrets or Node injection", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sentinel");
    vi.stubEnv("NODE_OPTIONS", "--require evil.js");
    try {
      const proc = child();
      const result = runVersion("C:\\Türkçe & boşluk\\codex.exe", "C:\\tools");
      const [file, args, options] = vi.mocked(spawn).mock.calls[0]!;
      expect(file).toBe("C:\\Türkçe & boşluk\\codex.exe");
      expect(args).toEqual(["--version"]);
      expect(options).toMatchObject({
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(options?.env).not.toHaveProperty("OPENAI_API_KEY");
      expect(options?.env).not.toHaveProperty("NODE_OPTIONS");
      proc.emit("close", 1);
      expect((await result).error).toBe("EXIT_FAILED");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("stops an active probe on worker shutdown", async () => {
    const proc = child();
    const controller = new AbortController();
    const result = runVersion(
      "C:\\tools\\codex.exe",
      "C:\\tools",
      controller.signal,
    );
    controller.abort();
    proc.emit("close", null);
    expect((await result).error).toBe("STOPPED");
    expect(proc.kill).toHaveBeenCalledOnce();
  });
});
