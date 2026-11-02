import { spawn } from "node:child_process";
import { build } from "esbuild";
import { createServer } from "vite";
import electron from "electron";
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
});
const server = await createServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  plugins: [
    {
      name: "spacescan-development-csp",
      transformIndexHtml(html) {
        return html.replace(
          "connect-src 'self'",
          "connect-src 'self' ws://127.0.0.1:5173",
        );
      },
    },
  ],
});
await server.listen();
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, SPACESCAN_DEV_URL: "http://127.0.0.1:5173" },
});
child.on("error", async (error) => {
  console.error(error.message);
  await server.close();
  process.exitCode = 1;
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
