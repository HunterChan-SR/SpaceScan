import { defineConfig } from "@playwright/test";
import path from "node:path";
import base from "./playwright.config";

const executable =
  process.platform === "darwin"
    ? `${process.arch === "arm64" ? "mac-arm64" : "mac"}/SpaceScan.app/Contents/MacOS/SpaceScan`
    : process.platform === "win32"
      ? "win-unpacked/SpaceScan.exe"
      : "linux-unpacked/spacescan";

export default defineConfig({
  ...base,
  outputDir: "test-results-packaged",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results-packaged/results.json" }],
    ["html", { open: "never", outputFolder: "playwright-report-packaged" }],
  ],
  projects: [
    {
      name: "packaged",
      metadata: { executablePath: path.resolve("release/test", executable) },
    },
  ],
});
