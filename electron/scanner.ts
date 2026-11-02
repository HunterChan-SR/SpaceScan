import { lstat, opendir, realpath, statfs } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withTimeout } from "./timeout";
import type { BigIntStats } from "node:fs";
import { categoryOf } from "../src/shared/categories";
import type {
  Category,
  DirectoryView,
  Entry,
  MapEntry,
  ScanProgress,
  ScanSummary,
  ViewQuery,
} from "../src/shared/types";

export interface IndexedEntry extends Entry {
  children: number[];
  identity: string;
  ownLogical: number;
  ownAllocated: number;
}
export interface ScanOptions {
  signal?: AbortSignal;
  maxEntries?: number;
  onProgress?: (progress: ScanProgress) => void;
}
const identity = (stat: BigIntStats) => `${stat.dev}:${stat.ino}`;
const safeNumber = (value: bigint) =>
  Number(
    value > BigInt(Number.MAX_SAFE_INTEGER)
      ? BigInt(Number.MAX_SAFE_INTEGER)
      : value,
  );
export class ScanIndex {
  readonly scanId = randomUUID();
  readonly nodes: IndexedEntry[] = [];
  rootPath = "";
  result: ScanSummary | null = null;
  private readonly hardlinks = new Set<string>();
  private progress: ScanProgress = {
    scanId: this.scanId,
    state: "idle",
    rootPath: "",
    entries: 0,
    files: 0,
    bytes: 0,
    elapsedMs: 0,
    currentPath: "",
    issues: 0,
  };
  private problems: { path: string; code: string }[] = [];

  getPath(id: number): string {
    const parts: string[] = [];
    let node = this.getNode(id);
    while (node.parentId !== null) {
      parts.push(node.name);
      node = this.getNode(node.parentId);
    }
    return path.join(this.rootPath, ...parts.reverse());
  }
  getNode(id: number): IndexedEntry {
    const node = this.nodes[id];
    if (!Number.isInteger(id) || !node)
      throw new Error("Entry is no longer available. Scan again.");
    return node;
  }
  publicEntry(id: number): Entry {
    const {
      children: _children,
      identity: _identity,
      ownLogical: _l,
      ownAllocated: _a,
      ...entry
    } = this.getNode(id);
    return entry;
  }
  private issue(filePath: string, code: string, node?: IndexedEntry) {
    this.progress.issues++;
    if (this.problems.length < 100)
      this.problems.push({ path: filePath, code });
    if (node) node.issue = code;
  }
  private add(
    name: string,
    parentId: number | null,
    stat: BigIntStats,
  ): IndexedEntry {
    const kind: Entry["kind"] = stat.isSymbolicLink()
      ? "link"
      : stat.isDirectory()
        ? "directory"
        : stat.isFile()
          ? "file"
          : "special";
    const key = identity(stat);
    const isFile = kind === "file";
    const hardlink =
      isFile && stat.nlink > 1n && stat.ino !== 0n && this.hardlinks.has(key);
    if (isFile && stat.nlink > 1n && stat.ino !== 0n) this.hardlinks.add(key);
    const logical =
      kind === "directory" || kind === "special" ? 0 : safeNumber(stat.size);
    const allocated =
      process.platform === "win32"
        ? logical
        : hardlink
          ? 0
          : safeNumber(stat.blocks * 512n);
    const node: IndexedEntry = {
      id: this.nodes.length,
      scanId: this.scanId,
      parentId,
      name,
      kind,
      logical,
      allocated,
      ownLogical: logical,
      ownAllocated: allocated,
      files: kind === "directory" ? 0 : 1,
      modified: Number(stat.mtimeMs),
      category:
        kind === "directory"
          ? "folder"
          : kind === "link"
            ? "link"
            : categoryOf(name),
      hardlink,
      children: [],
      identity: key,
    };
    this.nodes.push(node);
    if (parentId !== null) this.getNode(parentId).children.push(node.id);
    this.progress.entries++;
    this.progress.files += node.files;
    this.progress.bytes += logical;
    return node;
  }
  async scan(input: string, options: ScanOptions = {}): Promise<ScanSummary> {
    if (this.nodes.length)
      throw new Error("A scan index can only be used once.");
    this.rootPath = await realpath(input);
    // macOS exposes its writable startup volume through firmlinks. Scanning the
    // sealed '/' snapshot alone would omit Users and Applications at the device boundary.
    if (process.platform === "darwin" && this.rootPath === "/") {
      try {
        await lstat("/System/Volumes/Data");
        this.rootPath = "/System/Volumes/Data";
      } catch {
        /* Older or nonstandard layout. */
      }
    }
    const rootStat = await lstat(this.rootPath, { bigint: true });
    if (!rootStat.isDirectory()) throw new Error("Choose a folder or drive.");
    const started = performance.now();
    this.progress = {
      ...this.progress,
      state: "scanning",
      rootPath: this.rootPath,
    };
    this.add(path.basename(this.rootPath) || this.rootPath, null, rootStat);
    const stack = [0];
    let limited = false;
    let lastReport = 0;
    const report = (force = false) => {
      const now = performance.now();
      if (force || now - lastReport >= 100) {
        lastReport = now;
        this.progress.elapsedMs = now - started;
        options.onProgress?.({ ...this.progress });
      }
    };
    report(true);
    while (stack.length && !options.signal?.aborted && !limited) {
      const id = stack.pop()!;
      const directory = this.getNode(id);
      const directoryPath = this.getPath(id);
      this.progress.currentPath = directoryPath;
      try {
        // Recheck the directory before opening it: never intentionally traverse a link.
        const current = await lstat(directoryPath, { bigint: true });
        if (
          !current.isDirectory() ||
          identity(current) !== directory.identity ||
          (await realpath(directoryPath)) !== directoryPath
        ) {
          this.issue(directoryPath, "CHANGED_DURING_SCAN", directory);
          continue;
        }
        const dir = await opendir(directoryPath, { bufferSize: 128 });
        for await (const child of dir) {
          if (options.signal?.aborted) break;
          if (this.nodes.length >= (options.maxEntries ?? 1_000_000)) {
            limited = true;
            break;
          }
          const childPath = path.join(directoryPath, child.name);
          try {
            const stat = await lstat(childPath, { bigint: true });
            const entry = this.add(child.name, id, stat);
            if (entry.kind === "directory") {
              if (stat.dev === rootStat.dev) stack.push(entry.id);
              else this.issue(childPath, "OTHER_VOLUME", entry);
            }
          } catch (error) {
            this.issue(childPath, errorCode(error));
            directory.issue = "CHILD_UNREADABLE";
          }
          report();
        }
      } catch (error) {
        this.issue(directoryPath, errorCode(error), directory);
      }
      report();
    }
    // Reverse insertion order ensures every child is accumulated before its parent.
    for (let i = this.nodes.length - 1; i > 0; i--) {
      const node = this.nodes[i]!;
      const parent = this.nodes[node.parentId!]!;
      parent.logical += node.logical;
      parent.allocated += node.allocated;
      parent.files += node.files;
      if (node.issue && !parent.issue) parent.issue = "PARTIAL_FOLDER";
    }
    this.progress.state = options.signal?.aborted
      ? "cancelled"
      : limited
        ? "limited"
        : "complete";
    this.progress.elapsedMs = performance.now() - started;
    this.progress.currentPath = "";
    const categories = new Map<
      Category,
      { category: Category; bytes: number; files: number }
    >();
    for (const node of this.nodes) {
      if (node.kind === "directory") continue;
      const item = categories.get(node.category) ?? {
        category: node.category,
        bytes: 0,
        files: 0,
      };
      item.bytes += node.logical;
      item.files++;
      categories.set(node.category, item);
    }
    let capacity: number | null = null,
      available: number | null = null;
    try {
      const fs = await withTimeout(statfs(this.rootPath, { bigint: true }));
      capacity = safeNumber(fs.blocks * fs.bsize);
      available = safeNumber(fs.bavail * fs.bsize);
    } catch {
      /* Some remote filesystems do not provide this. */
    }
    this.result = {
      ...this.progress,
      completedAt: Date.now(),
      root: this.publicEntry(0),
      allocatedSupported: process.platform !== "win32",
      capacity,
      available,
      categories: [...categories.values()].sort((a, b) => b.bytes - a.bytes),
      problems: this.problems,
    };
    report(true);
    return this.result;
  }
  query(query: ViewQuery): DirectoryView {
    if (query.scanId !== this.scanId)
      throw new Error("Scan changed. Refresh the view.");
    const parent = this.getNode(query.parentId);
    if (parent.kind !== "directory")
      throw new Error("This entry is not a folder.");
    const breadcrumbs: Entry[] = [];
    let ancestor: IndexedEntry | undefined = parent;
    while (ancestor) {
      breadcrumbs.unshift(this.publicEntry(ancestor.id));
      ancestor =
        ancestor.parentId === null ? undefined : this.nodes[ancestor.parentId];
    }
    const matches = this.matching(query);
    const ordered = matches.sort(this.comparator(query));
    const mapChildren = parent.children
      .filter((id) => this.nodes[id]![query.metric] > 0)
      .sort(
        (a, b) => this.nodes[b]![query.metric] - this.nodes[a]![query.metric],
      );
    // Bound map payloads and preserve all bytes with a grouped remainder tile.
    const makeMap = (ids: number[], depth: number): MapEntry[] =>
      ids.slice(0, depth === 0 ? 70 : 8).map((id) => {
        const node = this.getNode(id);
        const children =
          depth < 2
            ? node.children
                .filter((i) => this.nodes[i]![query.metric] > 0)
                .sort(
                  (a, b) =>
                    this.nodes[b]![query.metric] - this.nodes[a]![query.metric],
                )
            : [];
        return {
          ...this.publicEntry(id),
          children: children.length ? makeMap(children, depth + 1) : undefined,
          omitted: children.length > 8 ? children.length - 8 : 0,
        };
      });
    return {
      parent: this.publicEntry(parent.id),
      path: this.getPath(parent.id),
      breadcrumbs,
      entries: ordered
        .slice(query.offset, query.offset + query.limit)
        .map((id) => this.publicEntry(id)),
      total: ordered.length,
      map: makeMap(mapChildren, 0),
      mapOmitted: Math.max(0, mapChildren.length - 70),
    };
  }
  matching(query: ViewQuery): number[] {
    const search = query.search.toLocaleLowerCase().trim();
    const all = search || query.category !== "all";
    const candidates = all
      ? this.nodes.map((node) => node.id).slice(1)
      : [...this.getNode(query.parentId).children];
    return candidates.filter((id) => {
      const node = this.getNode(id);
      return (
        (!search || node.name.toLocaleLowerCase().includes(search)) &&
        (query.category === "all" || node.category === query.category)
      );
    });
  }
  comparator(query: ViewQuery): (a: number, b: number) => number {
    return (a, b) => {
      const x = this.getNode(a),
        y = this.getNode(b);
      const diff =
        query.sort === "name"
          ? x.name.localeCompare(y.name, undefined, { numeric: true })
          : query.sort === "modified"
            ? x.modified - y.modified
            : x[query.metric] - y[query.metric];
      return (query.descending ? -diff : diff) || a - b;
    };
  }
}
export function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "IO_ERROR";
}
export { identity };
