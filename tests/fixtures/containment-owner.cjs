// Test-only owner process: same native owner and node-pty transport as the worker.
const { resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const native = require("../../apps/worker/dist/job_owner.node");
const { spawn } = require("node-pty");
const name = `Local\\AjanKati-${randomUUID()}`;
const job = native.create(name);
const env = {};
for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
  if (process.env[key]) env[key] = process.env[key];
const terminal = spawn(
  resolve("apps/worker/native/build/Release/diagnostic_bootstrap_test.exe"),
  [name, process.argv[2], String(process.pid)],
  {
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env,
    useConpty: true,
    useConptyDll: true,
  },
);
let output = "";
terminal.onData((data) => {
  output += data;
  if (output.includes(`STAGE:${process.argv[2]}`)) {
    process.send({
      pid: terminal.pid,
      members: native.members(job),
      ready: output.includes("READY"),
    });
    output = "";
  }
});
terminal.onExit(() => {
  native.close(job);
  process.exit(0);
});
setTimeout(() => {
  native.close(job);
  process.exit(2);
}, 15000);
