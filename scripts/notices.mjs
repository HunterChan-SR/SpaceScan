import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const packages = ["react", "react-dom", "scheduler", "lucide-react"];
const notices = [
  "SpaceScan third-party notices\n\nElectron and Chromium licenses are distributed with the runtime.\n",
];
for (const name of packages) {
  const directory = path.join("node_modules", name);
  const metadata = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const license = (await readdir(directory)).find((file) =>
    /^license(?:\.|$)/i.test(file),
  );
  if (!license)
    throw new Error(
      `Missing license for ${name}; do not distribute without it.`,
    );
  notices.push(
    `\n${"=".repeat(72)}\n${name} ${metadata.version}\n${"=".repeat(72)}\n\n${await readFile(path.join(directory, license), "utf8")}`,
  );
}
await writeFile("THIRD_PARTY_NOTICES.txt", notices.join("\n"));
