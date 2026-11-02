import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function sourceDigest() {
  const files = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "index.html",
  ];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const name = path.posix.join(directory, item.name);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile()) files.push(name);
    }
  }
  for (const directory of ["src", "electron", "scripts", "build"])
    await walk(directory);
  const hash = createHash("sha256");
  for (const file of files.sort())
    hash
      .update(file)
      .update("\0")
      .update(await readFile(file))
      .update("\0");
  return hash.digest("hex");
}

export async function buildInfo() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  return {
    version: pkg.version,
    electron: pkg.devDependencies.electron,
    node: process.version,
    builtAt: new Date().toISOString(),
    sourceSha256: await sourceDigest(),
  };
}
