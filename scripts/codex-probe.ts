import {
  createReadStream,
  copyFileSync,
  constants,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Store } from "../packages/storage/src/index";
import type { SessionUsage } from "../packages/contracts/src/index";
import { initializeOnly } from "../apps/worker/src/codex-handshake";
import { createNativeProbeTransport } from "../apps/worker/src/native-stdio";

// Standalone operator tool, intentionally absent from desktop IPC and CI scripts.
const root = resolve(__dirname);
const hash = "6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36";
const config = `cli_auth_credentials_store = "ephemeral"
mcp_oauth_credentials_store = "file"
check_for_update_on_startup = false
[analytics]
enabled = false
[feedback]
enabled = false
[history]
persistence = "none"
`;
function absent(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}
function ancestors(): void {
  for (let path = root; ; path = dirname(path)) {
    if (lstatSync(path).isSymbolicLink() || !absent(join(path, ".codex")))
      throw new Error("ANCESTOR_CONFIG_REVIEW_REQUIRED");
    if (dirname(path) === path) break;
  }
}
async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function main(): Promise<void> {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("WINDOWS_X64_REQUIRED");
  if (
    process.argv.length !== 3 ||
    !["--prepare", "--approve-initialize-only"].includes(process.argv[2])
  )
    throw new Error(
      "Use --prepare to review, then --approve-initialize-only after explicit human approval. No inference is supported.",
    );
  ancestors();
  const planPath = join(root, "codex-probe-plan.json");
  if (process.argv[2] === "--prepare") {
    if (!absent(planPath)) throw new Error("PROBE_PLAN_ALREADY_EXISTS");
    const source = join(
      homedir(),
      "AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
    );
    if ((await digest(source)) !== hash) throw new Error("IDENTITY_REJECTED");
    const image = join(root, "codex.exe");
    if (absent(image)) copyFileSync(source, image, constants.COPYFILE_EXCL);
    if ((await digest(image)) !== hash) throw new Error("IDENTITY_REJECTED");
    const profile = mkdtempSync(join(root, "codex-probe-"));
    writeFileSync(join(profile, "config.toml"), config, { flag: "wx" });
    const plan = {
      profile,
      sha256: hash,
      version: "0.164.0",
      methods: ["initialize", "initialized"],
      createdAt: new Date().toISOString(),
      used: false,
    };
    writeFileSync(planPath, JSON.stringify(plan, null, 2), { flag: "wx" });
    console.log(
      JSON.stringify({
        prepared: true,
        ...plan,
        inference: false,
        credentials: "none",
        systemPolicy: "native gate refuses existing machine configuration",
        deadlineSeconds: 15,
      }),
    );
    return;
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (
    plan.used !== false ||
    plan.sha256 !== hash ||
    plan.version !== "0.164.0" ||
    typeof plan.profile !== "string" ||
    dirname(plan.profile) !== root ||
    !plan.profile.startsWith(join(root, "codex-probe-"))
  )
    throw new Error("INVALID_PROBE_PLAN");
  if (
    lstatSync(plan.profile).isSymbolicLink() ||
    readdirSync(plan.profile).join() !== "config.toml" ||
    lstatSync(join(plan.profile, "config.toml")).isSymbolicLink() ||
    readFileSync(join(plan.profile, "config.toml"), "utf8") !== config
  )
    throw new Error("PROFILE_CHANGED");
  const lockPath = join(root, "codex-probe.lock");
  const lock = openSync(lockPath, "wx");
  const store = new Store(join(root, "codex-probe-ledger.sqlite"));
  let cleaned = false;
  try {
    store.recover();
    const projectId = store.createProject(
      "Non-inference native handshake probe",
    ).id;
    const row: SessionUsage = {
      sessionId: randomUUID(),
      runId: randomUUID(),
      projectId,
      provider: "codex",
      source: "codex-app-server",
      cliIdentity: `sha256:${hash}`,
      cliVersion: plan.version,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: "starting",
      retryCount: 0,
      threadId: null,
      turnId: null,
      totalTokens: null,
      tokenSource: null,
      cost: "UNKNOWN",
      quota: "UNKNOWN",
      reason: "NONE",
    };
    store.saveSession(row); // Durable single-session reservation before native launch.
    writeFileSync(planPath, JSON.stringify({ ...plan, used: true }, null, 2));
    const started = performance.now();
    const transport = createNativeProbeTransport(plan.profile);
    let initialized = false;
    try {
      await initializeOnly(transport);
      initialized = true;
    } finally {
      cleaned = await transport.terminate();
      row.status = initialized ? "completed" : "failed";
      row.reason = cleaned
        ? initialized
          ? "SHUTDOWN"
          : "PROTOCOL_ERROR"
        : "CLEANUP_UNCONFIRMED";
      if (cleaned) {
        row.endedAt = new Date().toISOString();
        row.durationMs = Math.round(performance.now() - started);
      }
      store.saveSession(row);
      console.log(
        JSON.stringify({
          initialized,
          cleaned,
          pid: transport.pid,
          error: transport.error?.code,
          durationMs: row.durationMs,
          tokens: "UNKNOWN",
          cost: "UNKNOWN",
        }),
      );
    }
  } finally {
    store.close();
    closeSync(lock);
    if (cleaned) unlinkSync(lockPath); // Uncertainty leaves quarantine; no automatic retry.
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PROBE_FAILED");
  process.exitCode = 1;
});
