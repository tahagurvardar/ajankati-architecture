import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { win32 } from "node:path";

/** Roots a workspace may never equal or contain. A workspace that contains the user
 * profile would put every provider credential/config directory under the CLI's cwd.
 * Derived from the account profile, not from the (minimal) worker environment. */
export function defaultProtectedRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string[] {
  const roots = [home, win32.join(home, "AppData")];
  const system = env.SystemRoot ?? env.WINDIR;
  if (system) {
    roots.push(system);
    const drive = win32.parse(system).root;
    for (const name of ["Program Files", "Program Files (x86)", "ProgramData"])
      roots.push(win32.join(drive, name));
  }
  return roots.filter((root) => /^[A-Za-z]:\\/.test(root));
}

/** Pure containment check: is any protected root equal to or inside the workspace? */
export function workspaceScopeViolation(
  workspacePath: string,
  roots: readonly string[],
): "WORKSPACE_TOO_BROAD" | null {
  const workspace = win32.normalize(workspacePath).toLowerCase();
  for (const root of roots) {
    const relative = win32.relative(
      workspace,
      win32.normalize(root).toLowerCase(),
    );
    if (
      !relative ||
      (!relative.startsWith("..") && !win32.isAbsolute(relative))
    )
      return "WORKSPACE_TOO_BROAD";
  }
  return null;
}

// Names that make a provider run workspace-controlled instructions, hooks, commands or
// MCP servers at startup. Existence is checked with lstat only; contents are never read.
const STARTUP_CONFIG_SURFACE = [
  ".claude",
  ".mcp.json",
  "CLAUDE.md",
  "CLAUDE.local.md",
  ".codex",
  "AGENTS.md",
  "AGENTS.override.md",
] as const;

/** Sorted names of provider startup-config entries present directly in the workspace.
 * An unreadable entry is reported as present (fail closed). */
export function startupConfigSurface(
  workspacePath: string,
  stat: typeof lstatSync = lstatSync,
): string[] {
  const found: string[] = [];
  for (const name of STARTUP_CONFIG_SURFACE) {
    try {
      stat(win32.join(workspacePath, name));
      found.push(name);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") found.push(name);
    }
  }
  return found.sort();
}
