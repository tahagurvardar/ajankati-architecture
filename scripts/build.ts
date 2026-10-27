import { build } from "esbuild";
import { build as buildRenderer } from "vite";
import { copyFileSync } from "node:fs";
await build({
  entryPoints: ["apps/worker/src/index.ts"],
  outfile: "apps/worker/dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["node-pty"],
  sourcemap: true,
});
copyFileSync("apps/worker/src/safe-echo.cjs", "apps/worker/dist/safe-echo.cjs");
// Electron is a Windows GUI executable: its run-as-node mode is not a console
// executable. Bundle the build's pinned Node 24 runtime for the fixed PTY probe.
if (process.platform === "win32") {
  if (process.versions.electron || !process.versions.node.startsWith("24."))
    throw new Error("Terminal runtime must be built with standalone Node 24.");
  copyFileSync(process.execPath, "apps/worker/dist/terminal-node.exe");
}
await build({
  entryPoints: ["apps/desktop/main/index.ts"],
  outfile: "apps/desktop/dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node24",
  sourcemap: true,
});
await build({
  entryPoints: ["apps/desktop/preload/index.ts"],
  outfile: "apps/desktop/dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node24",
});
await buildRenderer({
  root: "apps/desktop/renderer",
  base: "./",
  build: { outDir: "../dist/renderer", emptyOutDir: true },
});
