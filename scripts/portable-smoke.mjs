import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readdir, mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";

if (!["win32", "linux"].includes(process.platform))
  throw new Error("Portable launch checks require Windows or Linux.");

const suffix = process.platform === "win32" ? "-portable.exe" : ".AppImage";
const artifacts = (await readdir("release/test")).filter((file) =>
  file.endsWith(suffix),
);
if (artifacts.length !== 1)
  throw new Error(
    "Expected one native portable artifact. Build it on this runner first.",
  );
const artifact = path.resolve("release/test", artifacts[0]);

// Launch the actual wrapper, not a separately unpacked executable. On Linux
// this deliberately exercises AppImage mounting and its normal sandbox setup.
const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.packaged.config.ts",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, SPACESCAN_TEST_EXECUTABLE: artifact },
    },
  );
  child.on("error", reject);
  child.on("exit", (code) => resolve(code ?? 1));
});
const hash = createHash("sha256");
for await (const chunk of createReadStream(artifact)) hash.update(chunk);
await mkdir("test-results-packaged", { recursive: true });
await writeFile(
  "test-results-packaged/install-source.json",
  JSON.stringify(
    {
      artifact,
      sha256: hash.digest("hex"),
      checkedAt: new Date().toISOString(),
      mode: "direct-portable-launch",
      suiteExitCode: code,
    },
    null,
    2,
  ) + "\n",
);
const evidence = path.join("test-results-evidence", path.basename(artifact));
await mkdir(evidence, { recursive: true });
await cp("test-results-packaged", evidence, { recursive: true });
if (code !== 0)
  throw new Error("The portable artifact failed its desktop suite.");
console.log("Portable artifact launch and desktop tests passed.");
