import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, cp, rm, readdir, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin")
  throw new Error("DMG installation checks require macOS.");
const exec = promisify(execFile);
const project = process.cwd();
const candidates = await readdir("release/test");
const dmg = path.resolve(
  process.argv[2] ??
    `release/test/${candidates.find((file) => file.endsWith(`mac-${process.arch}.dmg`)) ?? ""}`,
);
if (!dmg.endsWith(".dmg")) throw new Error("Build a DMG first.");
const mount = await mkdtemp(path.join(os.tmpdir(), "spacescan-dmg-mount-"));
const install = await mkdtemp(path.join(os.tmpdir(), "spacescan-dmg-install-"));
let mounted = false;
try {
  await exec("hdiutil", [
    "attach",
    dmg,
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
  ]);
  mounted = true;
  const application = path.join(install, "SpaceScan.app");
  await cp(path.join(mount, "SpaceScan.app"), application, {
    recursive: true,
    verbatimSymlinks: true,
  });
  await exec("codesign", ["--verify", "--deep", "--strict", application]);
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
        cwd: project,
        stdio: "inherit",
        env: {
          ...process.env,
          SPACESCAN_TEST_EXECUTABLE: path.join(
            application,
            "Contents/MacOS/SpaceScan",
          ),
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(dmg)) hash.update(bytes);
  await writeFile(
    "test-results-packaged/install-source.json",
    JSON.stringify(
      {
        artifact: dmg,
        sha256: hash.digest("hex"),
        checkedAt: new Date().toISOString(),
        signature: "ad-hoc test signature verified",
        suiteExitCode: code,
      },
      null,
      2,
    ) + "\n",
  );
  const evidence = path.join(
    "test-results-evidence",
    path.basename(dmg, ".dmg"),
  );
  await mkdir(evidence, { recursive: true });
  await cp("test-results-packaged", evidence, { recursive: true });
  if (code !== 0)
    throw new Error(
      "The app copied from the DMG did not pass the desktop suite.",
    );
  console.log(
    "DMG attach, application copy, signature verification and installed-app tests passed.",
  );
} finally {
  if (mounted) await exec("hdiutil", ["detach", mount]);
  await rm(mount, { recursive: true, force: true });
  await rm(install, { recursive: true, force: true });
}
