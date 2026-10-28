import { fork, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { cpus } from "node:os";

if (process.platform !== "win32") throw new Error("Windows measurement only");
const data = mkdtempSync(resolve("apps/worker/dist/idle-measure-"));
const worker = fork(
  resolve("apps/worker/dist/index.cjs"),
  [join(data, "worker.sqlite")],
  {
    execArgv: [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  },
);
const deadline = setTimeout(() => worker.kill(), 30000);
try {
  const [ready] = await Promise.race([
    once(worker, "message"),
    once(worker, "exit").then(() => {
      throw new Error("Worker exited before ready");
    }),
  ]);
  if (ready.type !== "worker.ready") throw new Error("Worker not ready");
  const sample = () =>
    JSON.parse(
      execFileSync(
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Get-Process -Id ${worker.pid} | Select-Object WorkingSet64,PrivateMemorySize64,CPU,Handles | ConvertTo-Json -Compress`,
        ],
        { encoding: "utf8", windowsHide: true },
      ),
    );
  const before = sample();
  const start = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 20000));
  const after = sample();
  const wallSeconds = (performance.now() - start) / 1000;
  const cpuSeconds = after.CPU - before.CPU;
  console.log(
    JSON.stringify({
      scope: "idle standalone production worker; no GUI, no Codex",
      wallSeconds,
      logicalProcessors: cpus().length,
      workingSetMiB: after.WorkingSet64 / 1048576,
      privateMiB: after.PrivateMemorySize64 / 1048576,
      cpuSeconds,
      oneCorePercent: (cpuSeconds / wallSeconds) * 100,
      machinePercent: ((cpuSeconds / wallSeconds) * 100) / cpus().length,
      handlesBefore: before.Handles,
      handlesAfter: after.Handles,
    }),
  );
} finally {
  if (worker.exitCode === null && worker.signalCode === null) {
    const exited = once(worker, "exit");
    worker.disconnect();
    await exited;
  }
  clearTimeout(deadline);
}
