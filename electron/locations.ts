import { access, readdir, readFile, realpath, statfs } from "node:fs/promises";
import path from "node:path";
import type { Location } from "../src/shared/types";
import { withTimeout } from "./timeout";
export async function locations(
  home: string,
  recent: string[],
): Promise<Location[]> {
  const roots = new Set<string>();
  if (process.platform === "win32") {
    await Promise.all(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(async (letter) => {
        const drive = `${letter}:\\`;
        try {
          await withTimeout(access(drive));
          roots.add(drive);
        } catch {
          /* Not mounted. */
        }
      }),
    );
  } else if (process.platform === "darwin") {
    roots.add("/");
    try {
      const entries = await withTimeout(readdir("/Volumes"));
      await Promise.all(
        entries.map(async (item) => {
          try {
            roots.add(await withTimeout(realpath(path.join("/Volumes", item))));
          } catch {
            /* Disconnected drive. */
          }
        }),
      );
    } catch {
      /* No removable volumes. */
    }
  } else {
    roots.add("/");
    try {
      const mounts = await withTimeout(
        readFile("/proc/self/mountinfo", "utf8"),
      );
      for (const line of mounts.split("\n")) {
        const [left, right] = line.split(" - ");
        const type = right?.split(" ")[0];
        if (
          !type ||
          ![
            "ext4",
            "ext3",
            "ext2",
            "btrfs",
            "xfs",
            "vfat",
            "exfat",
            "ntfs",
            "ntfs3",
            "fuseblk",
            "zfs",
          ].includes(type)
        )
          continue;
        const mount = left
          ?.split(" ")[4]
          ?.replace(/\\([0-7]{3})/g, (_, octal: string) =>
            String.fromCharCode(parseInt(octal, 8)),
          );
        if (mount) roots.add(mount);
      }
    } catch {
      /* Non-Linux Unix. */
    }
  }
  const values: Location[] = [
    { name: path.basename(home), path: home, kind: "home" },
    ...[...roots].sort().map((root) => ({
      name: root === "/" ? "Macintosh HD" : path.basename(root) || root,
      path: root,
      kind: "volume" as const,
    })),
    ...recent
      .filter((root) => root !== home && !roots.has(root))
      .map((root) => ({
        name: path.basename(root) || root,
        path: root,
        kind: "recent" as const,
      })),
  ];
  if (process.platform !== "darwin")
    for (const item of values) if (item.path === "/") item.name = "Filesystem";
  await Promise.all(
    values
      .filter((item) => item.kind !== "recent")
      .map(async (item) => {
        try {
          const fs = await withTimeout(statfs(item.path));
          item.capacity = fs.blocks * fs.bsize;
          item.available = fs.bavail * fs.bsize;
        } catch {
          /* Optional capacity. */
        }
      }),
  );
  return values;
}
