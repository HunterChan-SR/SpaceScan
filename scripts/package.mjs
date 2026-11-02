import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sourceDigest } from "./build-info.mjs";

const require = createRequire(import.meta.url);
const release = process.argv.includes("--release");
const args = process.argv.slice(2).filter((arg) => arg !== "--release");
if (args.some((arg) => arg === "--publish" || arg.startsWith("--publish="))) {
  throw new Error(
    "Packaging does not publish artifacts. Use the approved release workflow to publish.",
  );
}
const target = args.includes("--mac")
  ? "darwin"
  : args.includes("--win")
    ? "win32"
    : args.includes("--linux")
      ? "linux"
      : process.platform;
const builderManifest = require.resolve("electron-builder/package.json");
const builder = JSON.parse(await readFile(builderManifest, "utf8"));
const cli = path.join(
  path.dirname(builderManifest),
  builder.bin["electron-builder"],
);
const options = [...args, "--publish", "never"];
const project = JSON.parse(await readFile("package.json", "utf8"));
const built = JSON.parse(await readFile("dist/build-info.json", "utf8"));
if (built.sourceSha256 !== (await sourceDigest()))
  throw new Error(
    "Source changed after the last build. Run npm run build before packaging.",
  );

if (release) {
  const homepage = project.homepage;
  let validHomepage = false;
  try {
    const url = new URL(homepage);
    validHomepage =
      ["https:", "http:"].includes(url.protocol) &&
      !url.hostname.endsWith(".invalid");
  } catch {
    /* Missing release metadata. */
  }
  if (!validHomepage)
    throw new Error(
      "Set package.json homepage to the actual project/repository URL before building a public release.",
    );
  if (
    target === "darwin" &&
    !process.env.CSC_LINK &&
    !process.env.SPACESCAN_MAC_IDENTITY
  ) {
    throw new Error(
      "A public macOS release needs a Developer ID certificate. Configure CSC_LINK or SPACESCAN_MAC_IDENTITY and notarization credentials before using --release.",
    );
  }
  if (target === "darwin" || target === "win32")
    options.push("-c.forceCodeSigning=true");
  if (target === "darwin") {
    if (process.env.SPACESCAN_MAC_IDENTITY === "-")
      throw new Error(
        "An ad-hoc signature cannot be used for a public macOS release.",
      );
    const notarization =
      process.env.APPLE_KEYCHAIN_PROFILE ||
      (process.env.APPLE_API_KEY &&
        process.env.APPLE_API_KEY_ID &&
        process.env.APPLE_API_ISSUER) ||
      (process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID);
    if (!notarization)
      throw new Error(
        "Configure Apple notarization credentials or APPLE_KEYCHAIN_PROFILE before building a public macOS release.",
      );
    options.push("-c.mac.hardenedRuntime=true", "-c.mac.notarize=true");
    if (process.env.SPACESCAN_MAC_IDENTITY)
      options.push(`-c.mac.identity=${process.env.SPACESCAN_MAC_IDENTITY}`);
  }
  console.log(
    "Building release artifacts. Validate signatures and notarization before publishing.",
  );
} else {
  options.push("-c.directories.output=release/test");
  if (target === "linux" && !project.homepage) {
    // Debian packages require a URL even for local tests. The reserved .invalid
    // domain is intentionally non-resolving and is forbidden in release mode.
    options.push(
      "-c.extraMetadata.homepage=https://example.invalid/spacescan-test-build",
    );
  }
  if (target === "darwin") {
    // Ad-hoc development signatures have no Team ID. A test build cannot use
    // release library validation; renderer isolation and sandboxing stay enabled.
    options.push("-c.mac.identity=-", "-c.mac.hardenedRuntime=false");
  }
  console.log(
    "Building local test artifacts in release/test. These are not signed public releases.",
  );
}

const child = spawn(process.execPath, [cli, ...options], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(!release ? { CSC_IDENTITY_AUTO_DISCOVERY: "false" } : {}),
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
