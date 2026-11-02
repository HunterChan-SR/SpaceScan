import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function poll(check, timeout, message) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(message);
    await delay(500);
  }
}

/**
 * Launch-checks an executable that Playwright's Electron launcher cannot drive.
 * The Windows portable artifact is an NSIS wrapper: it extracts the app, runs it
 * as a child process and does not forward its stdio, so Playwright never sees
 * the inspector endpoint. Command-line switches are passed through, so attach to
 * the renderer over the Chromium debugging port instead.
 */
export async function cdpLaunchCheck(
  executable,
  {
    expectExitOnClose = process.platform !== "darwin",
    startTimeout = 120_000,
  } = {},
) {
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "spacescan-launch-profile-"),
  );
  const port = await freePort();
  const child = spawn(
    executable,
    [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`],
    { stdio: "ignore" },
  );
  let exitCode, spawnError, browser;
  const exited = new Promise((resolve) =>
    child.once("exit", (code) => resolve((exitCode = code ?? 1))),
  );
  child.once("error", (error) => (spawnError = error));
  const result = { executable, expectedVersion: version };
  try {
    await poll(
      async () => {
        if (spawnError) throw spawnError;
        if (exitCode !== undefined)
          throw new Error(`The launcher exited (${exitCode}) before the app opened.`);
        try {
          return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
        } catch {
          return false;
        }
      },
      startTimeout,
      "The app did not open its debugging endpoint.",
    );
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = await poll(
      async () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().endsWith("/dist/index.html")),
      30_000,
      "The SpaceScan window did not load.",
    );
    await page
      .getByRole("heading", { name: "发现空间的去向" })
      .waitFor({ timeout: 30_000 });
    Object.assign(
      result,
      await page.evaluate(async () => {
        const boot = await window.spacescan.bootstrap();
        return {
          appVersion: boot.version,
          platform: boot.platform,
          sandboxed: window.spacescan.runtime.sandboxed,
          contextIsolated: window.spacescan.runtime.contextIsolated,
          rendererURL: location.href,
        };
      }),
    );
    if (result.appVersion !== version)
      throw new Error(`Launched version ${result.appVersion}, expected ${version}.`);
    if (!result.sandboxed || !result.contextIsolated)
      throw new Error("The launched renderer is not sandboxed and isolated.");
    // Close the window as a user would. Except on macOS the app then quits, and a
    // portable launcher must exit successfully after removing its extraction.
    const closed = page.waitForEvent("close", { timeout: 30_000 });
    await page.evaluate(() => window.close()).catch(() => {});
    await closed;
    result.windowClosed = true;
    if (expectExitOnClose) {
      const code = await Promise.race([exited, delay(60_000)]);
      if (code === undefined)
        throw new Error("The app did not exit after its window closed.");
      result.exitCode = code;
      if (code !== 0) throw new Error(`The launcher exited with code ${code}.`);
    }
    return result;
  } finally {
    await browser?.close().catch(() => {});
    if (exitCode === undefined && child.pid) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
      else child.kill("SIGKILL");
      await Promise.race([exited, delay(10_000)]);
    }
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 1000,
    });
  }
}
