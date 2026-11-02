import { build } from "esbuild";
import { build as viteBuild } from "vite";
import "./notices.mjs";
import { buildInfo } from "./build-info.mjs";
import { writeFile } from "node:fs/promises";
await build({
  entryPoints: [
    "electron/main.ts",
    "electron/preload.ts",
    "electron/worker.ts",
  ],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron"],
  sourcemap: true,
  minify: false,
});
await viteBuild({ base: "./", build: { sourcemap: true } });
await writeFile(
  "dist/build-info.json",
  JSON.stringify(await buildInfo(), null, 2) + "\n",
);
