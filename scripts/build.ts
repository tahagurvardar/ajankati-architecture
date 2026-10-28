import { build } from "esbuild";
import { build as buildRenderer } from "vite";
import { copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
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
copyFileSync(
  "apps/worker/src/diagnostic-tree.cjs",
  "apps/worker/dist/diagnostic-tree.cjs",
);
// Electron is a Windows GUI executable: its run-as-node mode is not a console
// executable. Bundle the build's pinned Node 24 runtime for the fixed PTY probe.
if (process.platform === "win32") {
  if (process.versions.electron || !process.versions.node.startsWith("24."))
    throw new Error("Terminal runtime must be built with standalone Node 24.");
  copyFileSync(process.execPath, "apps/worker/dist/terminal-node.exe");
  if (process.arch !== "x64")
    throw new Error("Native diagnostics require Windows x64.");
  execFileSync(
    process.execPath,
    [
      require.resolve("node-gyp/bin/node-gyp.js"),
      "rebuild",
      "--directory=apps/worker/native",
    ],
    { stdio: "inherit" },
  );
  for (const file of ["job_owner.node", "diagnostic_bootstrap.exe"])
    copyFileSync(
      `apps/worker/native/build/Release/${file}`,
      `apps/worker/dist/${file}`,
    );
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
