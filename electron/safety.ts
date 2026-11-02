import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { identity, type ScanIndex } from "./scanner";

export function isWithin(
  root: string,
  candidate: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const p = platform === "win32" ? path.win32 : path.posix;
  const relative = p.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${p.sep}`) &&
      relative !== ".." &&
      !p.isAbsolute(relative))
  );
}
export function protectedPath(
  candidate: string,
  home: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const p = platform === "win32" ? path.win32 : path.posix;
  const resolved = p.resolve(candidate);
  const normalized =
    platform === "darwin" &&
    isWithin("/System/Volumes/Data", resolved, platform)
      ? resolved.slice("/System/Volumes/Data".length) || "/"
      : resolved;
  if (
    normalized === p.parse(normalized).root ||
    normalized === home ||
    isWithin(normalized, home, platform)
  )
    return true;
  if (platform === "win32") {
    const windowsRoot = p.parse(normalized).root;
    return [
      "Windows",
      "Program Files",
      "Program Files (x86)",
      "ProgramData",
      "$Recycle.Bin",
      "System Volume Information",
    ].some((folder) =>
      isWithin(p.join(windowsRoot, folder), normalized, platform),
    );
  }
  return [
    "/System",
    "/bin",
    "/sbin",
    "/usr",
    "/etc",
    "/dev",
    "/proc",
    "/sys",
    "/run",
    "/boot",
    "/lib",
    "/lib64",
    "/private/etc",
    "/private/var",
    "/Library",
  ].some((folder) => isWithin(folder, normalized, platform));
}
export function trashEligibility(
  index: ScanIndex,
  id: number,
  home: string,
): { allowed: boolean; reason?: string } {
  const node = index.getNode(id);
  if (id === 0 || protectedPath(index.getPath(id), home))
    return { allowed: false, reason: "protected" };
  if (
    node.kind === "special" ||
    node.issue ||
    index.result?.state !== "complete"
  )
    return { allowed: false, reason: "incomplete" };
  return { allowed: true };
}
export async function validateTrash(
  index: ScanIndex,
  id: number,
  home: string,
): Promise<string> {
  const eligibility = trashEligibility(index, id, home);
  if (!eligibility.allowed)
    throw new Error(`Cannot move this entry to Trash (${eligibility.reason}).`);
  const candidate = index.getPath(id),
    node = index.getNode(id);
  const parent = await realpath(path.dirname(candidate));
  // Catch renamed ancestors and symlink/junction replacement after the scan.
  if (parent !== path.dirname(candidate) || !isWithin(index.rootPath, parent))
    throw new Error(
      "Folder location changed. Scan again before moving it to Trash.",
    );
  const current = await lstat(candidate, { bigint: true });
  if (
    identity(current) !== node.identity ||
    Number(current.mtimeMs) !== node.modified ||
    (node.kind === "directory") !== current.isDirectory() ||
    (node.kind === "link") !== current.isSymbolicLink()
  ) {
    throw new Error(
      "This entry changed after the scan. Scan again before moving it to Trash.",
    );
  }
  return candidate;
}
