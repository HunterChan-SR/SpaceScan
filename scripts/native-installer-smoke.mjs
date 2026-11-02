import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  access,
  cp,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Installation changes a disposable CI runner. It must never run silently on a
// developer's personal machine; use the normal installer there.
if (process.env.CI !== "true")
  throw new Error(
    "Installer automation is restricted to disposable CI runners.",
  );
if (!["win32", "linux"].includes(process.platform))
  throw new Error("Use test:dmg on macOS.");
const exec = promisify(execFile);
const files = await readdir("release/test");
const windows = process.platform === "win32";
const name = files.find((file) =>
  windows ? file.endsWith("-setup.exe") : file.endsWith(".deb"),
);
if (!name) throw new Error("Build the native installer first.");
const artifact = path.resolve("release/test", name);
const directory = await mkdtemp(path.join(os.tmpdir(), "spacescan-installed-"));
let installed = false;
let executable;
let evidence;
let verifiedUninstall = false;
async function waitUntilRemoved(file) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await access(file);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "The native uninstaller left the application executable behind.",
  );
}
try {
  if (windows) {
    await exec(artifact, ["/S", `/D=${directory}`], { timeout: 120000 });
    executable = path.join(directory, "SpaceScan.exe");
  } else {
    await exec("sudo", ["dpkg", "--install", artifact], { timeout: 120000 });
    const { stdout } = await exec("dpkg", ["--listfiles", "spacescan"]);
    executable = stdout
      .split("\n")
      .find((file) => file.endsWith("/spacescan") && file.startsWith("/opt/"));
    if (!executable)
      throw new Error("The Debian package did not contain its executable.");
  }
  installed = true;
  await access(executable);
  // Reinstall in place and verify the resulting app too. This catches installers
  // that fail over an existing installation without claiming cross-version migration.
  if (windows)
    await exec(artifact, ["/S", `/D=${directory}`], { timeout: 120000 });
  else await exec("sudo", ["dpkg", "--install", artifact], { timeout: 120000 });
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
        env: { ...process.env, SPACESCAN_TEST_EXECUTABLE: executable },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  await writeFile(
    "test-results-packaged/install-source.json",
    JSON.stringify(
      {
        artifact,
        sha256: hash.digest("hex"),
        checkedAt: new Date().toISOString(),
        suiteExitCode: code,
      },
      null,
      2,
    ) + "\n",
  );
  evidence = path.join("test-results-evidence", name);
  await mkdir(evidence, { recursive: true });
  await cp("test-results-packaged", evidence, { recursive: true });
  if (code !== 0)
    throw new Error("The installed application failed desktop tests.");
  console.log("Native installation and installed-app tests passed.");
} finally {
  if (installed) {
    if (windows) {
      const uninstallers = (await readdir(directory)).filter((file) =>
        /^Uninstall.*\.exe$/i.test(file),
      );
      if (uninstallers.length !== 1)
        throw new Error("Expected one native uninstaller.");
      await exec(
        path.join(directory, uninstallers[0]),
        ["/S", `_?=${directory}`],
        { timeout: 120000 },
      );
    } else
      await exec("sudo", ["dpkg", "--remove", "spacescan"], {
        timeout: 120000,
      });
    await waitUntilRemoved(executable);
    verifiedUninstall = true;
  }
  if (evidence)
    await writeFile(
      path.join(evidence, "lifecycle.json"),
      JSON.stringify(
        {
          sameVersionReinstall: true,
          executableRemovedByUninstaller: verifiedUninstall,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 1000,
  });
}
