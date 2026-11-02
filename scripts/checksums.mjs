import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
const directory = process.argv[2] ?? "release";
const files = (await readdir(directory))
  .filter((name) => /\.(dmg|zip|exe|AppImage|deb)$/.test(name))
  .sort();
if (!files.length)
  throw new Error("No release artifacts found. Build installers first.");
const lines = [];
for (const file of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(`${directory}/${file}`))
    hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${file}`);
}
await writeFile(`${directory}/SHA256SUMS.txt`, `${lines.join("\n")}\n`);
console.log(`Wrote checksums for ${files.length} artifacts.`);
