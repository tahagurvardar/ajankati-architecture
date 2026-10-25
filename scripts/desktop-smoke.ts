import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const electron = require("electron") as string;
const data = mkdtempSync(join(tmpdir(), "ajankati-desktop-"));
const env: NodeJS.ProcessEnv = { AJANKATI_SMOKE_DATA: data };
for (const key of [
  "PATH",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "DISPLAY",
  "XAUTHORITY",
  "XDG_RUNTIME_DIR",
  "LANG",
  "AJANKATI_SMOKE_SCREENSHOT",
])
  if (process.env[key]) env[key] = process.env[key];
let passed = false;
let timedOut = false;
try {
  const child = spawn(
    electron,
    [...process.argv.slice(2), "tests/fixtures/desktop-smoke.cjs"],
    { env, stdio: ["ignore", "pipe", "inherit"] },
  );
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 45000);
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (text.includes("PASS Electron renderer")) passed = true;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  }).finally(() => clearTimeout(timer));
  if (code !== 0 || !passed || timedOut)
    throw new Error("Electron smoke başarısız veya süre aşımı.");
} finally {
  // Chromium holds profile files on Windows until the entire Electron process exits.
  rmSync(data, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
