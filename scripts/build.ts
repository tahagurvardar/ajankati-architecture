import { build } from "esbuild";
import { build as buildRenderer } from "vite";
await build({
  entryPoints: ["apps/worker/src/index.ts"],
  outfile: "apps/worker/dist/index.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: true,
});
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
