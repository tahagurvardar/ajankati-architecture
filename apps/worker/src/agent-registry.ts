import { spawn, type ChildProcess } from "node:child_process";
import { lstat, realpath, open } from "node:fs/promises";
import { win32, join, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { release } from "node:os";
import {
  agentCommandSchema,
  type AgentState,
  type AgentRecord,
  type IntegrationId,
} from "@ajankati/contracts";

const forbidden =
  /(?:^|[\\/])(?:\.claude|\.codex|\.aws|\.ssh|\.serena)(?:[\\/]|$)/i;
function localWindowsPath(value: string): boolean {
  return (
    /^[a-z]:\\/i.test(value) &&
    ![...value].some((c) => c.charCodeAt(0) < 32) &&
    !value.slice(2).includes(":") &&
    !forbidden.test(value)
  );
}
export function windowsSearchDirectories(path: string, cwd: string): string[] {
  const found = new Map<string, string>();
  for (const raw of path.split(";").slice(0, 128)) {
    const item = raw.trim().replace(/^"(.*)"$/, "$1");
    if (!localWindowsPath(item) || item.length > 4000) continue;
    const normalized = win32.normalize(item);
    const relative = win32.relative(cwd, normalized);
    if (
      !relative ||
      (!relative.startsWith("..") && !win32.isAbsolute(relative))
    )
      continue;
    if (!found.has(normalized.toLowerCase()))
      found.set(normalized.toLowerCase(), normalized);
  }
  return [...found.values()];
}

export function parseVersion(id: IntegrationId, output: string): string | null {
  if (
    output.length > 200 ||
    [...output].some(
      (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)),
    )
  )
    return null;
  const semver = "([0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?)";
  const pattern =
    id === "claude-code"
      ? `^${semver} \\(Claude Code\\)$`
      : `^codex-cli ${semver}$`;
  return new RegExp(pattern).exec(output.trim())?.[1] ?? null;
}
type ProbeError =
  | "TIMEOUT"
  | "LAUNCH_FAILED"
  | "EXIT_FAILED"
  | "OUTPUT_LIMIT"
  | "STOPPED";
type ProbeResult = { output: string; error: ProbeError | null };

// No shell, wrapper, renderer arguments, stdin, inherited secrets or raw stderr.
// This bounds the direct child only; it is deliberately not a general agent launcher.
export function runVersion(
  path: string,
  cwd: string,
  signal?: AbortSignal,
  timeoutMs = 4000,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    let output = "";
    let bytes = 0;
    let failure: ProbeError | null = null;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
      if (process.env[key]) env[key] = process.env[key];
    const finish = (error: ProbeError | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      resolve({ output: error ? "" : output, error });
    };
    const halt = (error: ProbeError) => {
      if (settled || failure) return;
      failure = error;
      child?.kill();
      killTimer = setTimeout(() => finish(error), 500);
    };
    const abort = () => halt("STOPPED");
    const timer = setTimeout(() => halt("TIMEOUT"), timeoutMs);
    if (signal?.aborted) {
      finish("STOPPED");
      return;
    }
    try {
      child = spawn(path, ["--version"], {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      signal?.addEventListener("abort", abort, { once: true });
      const consume = (chunk: Buffer, stdout: boolean) => {
        bytes += chunk.length;
        if (bytes > 4096) {
          halt("OUTPUT_LIMIT");
          return;
        }
        if (stdout) output += chunk.toString("utf8");
      };
      child.stdout?.on("data", (chunk: Buffer) => consume(chunk, true));
      child.stderr?.on("data", (chunk: Buffer) => consume(chunk, false));
      child.once("error", () => finish("LAUNCH_FAILED"));
      child.once("close", (code) =>
        finish(failure ?? (code === 0 ? null : "EXIT_FAILED")),
      );
    } catch {
      finish("LAUNCH_FAILED");
    }
  });
}

function initial(id: IntegrationId): AgentRecord {
  return {
    integrationId: id,
    provider: id === "claude-code" ? "Claude Code" : "Codex CLI",
    executable: null,
    detectedVersion: null,
    discovered: false,
    verified: false,
    enabled: false,
    approvalToken: null,
    lastVerificationAt: null,
    compatibilityEvidence: [],
    error: null,
    capabilities: {
      versionCheck: "unknown",
      pty: "unknown",
      processOwnership: "unknown",
      permissions: "unknown",
      cancellation: "unknown",
      sandbox: "unknown",
      structuredEvents: "unknown",
      managedTasks: "unsupported",
    },
  };
}
const messages: Record<string, string> = {
  NOT_FOUND: "CLI sınırlı yerel PATH aramasında bulunamadı.",
  UNSUPPORTED_PLATFORM: "Keşif yalnız Windows üzerinde desteklenir.",
  UNSUPPORTED_WRAPPER:
    "Bu .cmd düzeni güvenle çözülemedi; shell ile çalıştırılmadı.",
  IDENTITY_CHANGED:
    "Dosya kimliği değişti veya dosya kaldırıldı; yeniden keşfedin.",
  UNKNOWN_VERSION: "Sürüm çıktısı tanınmadı; uyumluluk bilinmiyor.",
  TIMEOUT:
    "Sürüm kontrolü süre sınırını aştı; doğrudan çocuk için sonlandırma istendi. Süreç ağacı doğrulanmadı.",
  LAUNCH_FAILED: "Sürüm kontrolü başlatılamadı.",
  EXIT_FAILED: "Sürüm kontrolü başarısız çıkış yaptı.",
  OUTPUT_LIMIT: "Sürüm çıktısı sınırı aşıldı.",
  STOPPED: "Doğrulama durduruldu.",
};
function error(row: AgentRecord, code: string) {
  row.error = { code, message: messages[code] ?? "Keşif başarısız." };
}
async function identity(
  path: string,
): Promise<{ path: string; fingerprint: string }> {
  const canonical = await realpath(path);
  if (process.platform === "win32" && !localWindowsPath(canonical))
    throw new Error("Unsafe path");
  if (forbidden.test(canonical) || !/\.(exe|cmd)$/i.test(canonical))
    throw new Error("Unsafe file");
  const stat = await lstat(canonical, { bigint: true });
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024)
    throw new Error("Invalid file");
  return {
    path: canonical,
    fingerprint: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,
  };
}

// Exact npm cmd-shim template only. Never interpret cmd contents or execute JS.
export function codexShimTemplate(): string {
  return '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\n\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%\n)\n\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\n';
}
async function nativeFromShim(source: string): Promise<string | null> {
  const file = await open(source, "r");
  try {
    const bytes = Buffer.alloc(4097);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (
      bytesRead > 4096 ||
      bytes.subarray(0, bytesRead).toString("utf8").replace(/\r\n/g, "\n") !==
        codexShimTemplate()
    )
      return null;
  } finally {
    await file.close();
  }
  const arch =
    process.arch === "x64"
      ? "x86_64"
      : process.arch === "arm64"
        ? "aarch64"
        : null;
  if (!arch) return null;
  const base = join(dirname(source), "node_modules", "@openai");
  const pkg = `codex-win32-${process.arch}`;
  const roots = [
    join(base, "codex", "node_modules", "@openai", pkg),
    join(base, pkg),
    join(base, "codex"),
  ];
  for (const root of roots) {
    for (const folder of ["bin", "codex"]) {
      const path = join(
        root,
        "vendor",
        `${arch}-pc-windows-msvc`,
        folder,
        "codex.exe",
      );
      try {
        return (await identity(path)).path;
      } catch {
        /* fixed candidate absent */
      }
    }
  }
  return null;
}

export class AgentRegistry {
  private rows: AgentRecord[] = [initial("claude-code"), initial("codex-cli")];
  private busy = false;
  private stopped = false;
  private controller = new AbortController();
  private readonly directories: string[];
  private readonly platform: string;
  private readonly probe: typeof runVersion;
  constructor(
    options: {
      directories?: string[];
      platform?: string;
      probe?: typeof runVersion;
    } = {},
  ) {
    this.directories =
      options.directories ??
      windowsSearchDirectories(process.env.PATH ?? "", process.cwd());
    this.platform = options.platform ?? process.platform;
    this.probe = options.probe ?? runVersion;
  }
  stop(): void {
    this.stopped = true;
    this.controller.abort();
  }
  async execute(input: unknown): Promise<AgentState> {
    const command = agentCommandSchema.parse(input);
    if (this.stopped) throw new Error("Keşif kapatıldı.");
    if (command.method === "list")
      return structuredClone({ integrations: this.rows });
    if (this.busy) throw new Error("Bir keşif veya doğrulama zaten sürüyor.");
    this.busy = true;
    try {
      if (command.method === "discover") {
        const next: AgentRecord[] = [];
        for (const id of ["claude-code", "codex-cli"] as const)
          next.push(await this.discover(id));
        this.rows = next;
      } else {
        const row = this.rows.find(
          (x) => x.integrationId === command.payload.integrationId,
        )!;
        if (
          !row.approvalToken ||
          row.approvalToken !== command.payload.approvalToken ||
          !row.executable
        )
          throw new Error("Onay geçersiz veya tüketilmiş; yeniden keşfedin.");
        row.approvalToken = null;
        row.lastVerificationAt = new Date().toISOString();
        row.verified = false;
        row.detectedVersion = null;
        row.compatibilityEvidence = [];
        row.capabilities.versionCheck = "unknown";
        const expected = row.executable;
        try {
          const current = await identity(expected.path);
          const source = await identity(expected.sourcePath);
          if (
            current.path !== expected.path ||
            current.fingerprint !== expected.fingerprint ||
            source.path !== expected.sourceCanonicalPath ||
            source.fingerprint !== expected.sourceFingerprint
          )
            throw new Error("Changed");
        } catch {
          error(row, "IDENTITY_CHANGED");
          return structuredClone({ integrations: this.rows });
        }
        const result = await this.probe(
          expected.path,
          dirname(expected.path),
          this.controller.signal,
        );
        if (result.error) error(row, result.error);
        else {
          const version = parseVersion(row.integrationId, result.output);
          if (!version) error(row, "UNKNOWN_VERSION");
          else {
            row.detectedVersion = version;
            row.verified = true;
            row.error = null;
            row.capabilities.versionCheck = "verified";
            row.compatibilityEvidence = [
              {
                source: "local-version-probe-v1",
                observedAt: row.lastVerificationAt,
                platform: `${this.platform} ${release()} ${process.arch}`,
                version,
                fingerprint: expected.fingerprint,
              },
            ];
          }
        }
      }
      return structuredClone({ integrations: this.rows });
    } finally {
      this.busy = false;
    }
  }
  private async discover(id: IntegrationId): Promise<AgentRecord> {
    const row = initial(id);
    if (this.platform !== "win32") {
      error(row, "UNSUPPORTED_PLATFORM");
      return row;
    }
    const name = id === "claude-code" ? "claude" : "codex";
    for (const directory of this.directories.slice(0, 128)) {
      for (const extension of ["exe", "cmd"] as const) {
        const candidate = join(directory, `${name}.${extension}`);
        let source;
        try {
          source = await identity(candidate);
        } catch {
          continue;
        }
        // Alias filenames cannot smuggle arbitrary credential files into the reader.
        if (basename(source.path).toLowerCase() !== `${name}.${extension}`)
          continue;
        row.discovered = true;
        row.executable = {
          path: source.path,
          sourcePath: candidate,
          sourceCanonicalPath: source.path,
          kind: extension,
          fingerprint: source.fingerprint,
          sourceFingerprint: source.fingerprint,
        };
        if (extension === "cmd") {
          let native: string | null = null;
          try {
            if (id === "codex-cli") native = await nativeFromShim(source.path);
          } catch {
            /* fail closed */
          }
          if (!native) {
            error(row, "UNSUPPORTED_WRAPPER");
            row.capabilities.versionCheck = "unsupported";
            return row;
          }
          const resolved = await identity(native);
          row.executable = {
            ...row.executable,
            path: resolved.path,
            kind: "npm-native",
            fingerprint: resolved.fingerprint,
          };
        }
        row.approvalToken = randomUUID();
        return row;
      }
    }
    error(row, "NOT_FOUND");
    return row;
  }
}
