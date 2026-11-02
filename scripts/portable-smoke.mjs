import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readdir, mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { cdpLaunchCheck } from "./cdp-launch-check.mjs";

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
const evidence = path.join("test-results-evidence", path.basename(artifact));
async function sha256() {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  return hash.digest("hex");
}

if (process.platform === "win32") {
  // The portable wrapper runs the extracted app as a child without forwarding
  // stdio, so Playwright's Electron launcher cannot attach to it. The unpacked
  // and installed apps run the full suite; here the real wrapper is launched,
  // its window is checked over the debugging port, closed, and the wrapper must
  // then exit cleanly.
  let result, failure;
  try {
    result = await cdpLaunchCheck(artifact);
  } catch (error) {
    failure = error;
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(
    path.join(evidence, "launch.json"),
    JSON.stringify(
      {
        artifact,
        sha256: await sha256(),
        checkedAt: new Date().toISOString(),
        mode: "portable-wrapper-cdp-launch",
        ...result,
        error: failure ? String(failure.message ?? failure) : undefined,
      },
      null,
      2,
    ) + "\n",
  );
  if (failure) throw failure;
  console.log(
    "Portable launcher started the app, loaded its window and exited cleanly.",
  );
} else {
  // Launch the actual AppImage, not a separately unpacked executable. This
  // deliberately exercises AppImage mounting and its normal sandbox setup.
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
  await mkdir("test-results-packaged", { recursive: true });
  await writeFile(
    "test-results-packaged/install-source.json",
    JSON.stringify(
      {
        artifact,
        sha256: await sha256(),
        checkedAt: new Date().toISOString(),
        mode: "direct-portable-launch",
        suiteExitCode: code,
      },
      null,
      2,
    ) + "\n",
  );
  await mkdir(evidence, { recursive: true });
  await cp("test-results-packaged", evidence, { recursive: true });
  if (code !== 0)
    throw new Error("The portable artifact failed its desktop suite.");
  console.log("Portable artifact launch and desktop tests passed.");
}
