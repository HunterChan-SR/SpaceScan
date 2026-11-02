import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  link,
  lstat,
  chmod,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ScanIndex } from "../electron/scanner";
import type { ViewQuery } from "../src/shared/types";

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "spacescan-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const queryFor = (
  index: ScanIndex,
  extra: Partial<ViewQuery> = {},
): ViewQuery => ({
  scanId: index.scanId,
  parentId: 0,
  metric: "logical",
  sort: "size",
  descending: true,
  search: "",
  category: "all",
  offset: 0,
  limit: 100,
  ...extra,
});
test("scans a real tree, aggregates bytes, preserves Unicode and supports navigation/search", async () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "照片"));
    await writeFile(path.join(root, "照片", "holiday.jpg"), Buffer.alloc(8192));
    await writeFile(path.join(root, "notes.md"), "hello");
    await writeFile(path.join(root, ".hidden"), "123");
    await mkdir(path.join(root, "empty"));
    const index = new ScanIndex();
    const progress: string[] = [];
    const result = await index.scan(root, {
      onProgress: (value) => progress.push(value.state),
    });
    assert.equal(result.state, "complete");
    assert.equal(result.root.logical, 8200);
    assert.equal(result.root.files, 3);
    assert.equal(result.entries, 6);
    assert.equal(result.issues, 0);
    assert.equal(progress[0], "scanning");
    assert.equal(progress.at(-1), "complete");
    const view = index.query(queryFor(index));
    assert.equal(view.entries[0]?.name, "照片");
    const folder = view.entries[0]!;
    const nested = index.query(queryFor(index, { parentId: folder.id }));
    assert.equal(nested.entries[0]?.name, "holiday.jpg");
    assert.equal(nested.breadcrumbs.length, 2);
    assert.equal(index.query(queryFor(index, { search: "HOLIDAY" })).total, 1);
    assert.equal(
      index.query(queryFor(index, { category: "document" })).entries[0]?.name,
      "notes.md",
    );
    assert.equal(
      index.query(queryFor(index, { offset: 1, limit: 1 })).entries.length,
      1,
    );
    assert.throws(
      () => index.query(queryFor(index, { scanId: "stale" })),
      /Scan changed/,
    );
    assert.throws(() => index.getNode(-1));
  }));
test("does not traverse directory symlinks or cycles", {}, async () =>
  fixture(async (root) => {
    await mkdir(path.join(root, "folder"));
    await writeFile(path.join(root, "folder", "a"), "abc");
    await symlink(
      root,
      path.join(root, "folder", "cycle"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const index = new ScanIndex();
    const result = await index.scan(root);
    assert.equal(result.entries, 4);
    const symlinkEntry = index.nodes.find((node) => node.kind === "link");
    assert.ok(symlinkEntry);
    assert.equal(symlinkEntry.children.length, 0);
    assert.equal(symlinkEntry.category, "link");
  }),
);
test("hard links retain logical sizes while allocation is counted once", async () =>
  fixture(async (root) => {
    const file = path.join(root, "a.bin");
    await writeFile(file, Buffer.alloc(4096));
    await link(file, path.join(root, "b.bin"));
    const index = new ScanIndex();
    const result = await index.scan(root);
    assert.equal(result.root.logical, 8192);
    assert.equal(result.files, 2);
    const shared = index.nodes.filter((node) => node.hardlink);
    assert.equal(shared.length, 1);
    if (process.platform !== "win32") {
      const stat = await lstat(file);
      assert.equal(
        index.nodes
          .filter((node) => node.kind === "file")
          .reduce((n, node) => n + node.allocated, 0),
        stat.blocks * 512,
      );
    } else assert.equal(result.allocatedSupported, false);
  }));
test("cancel and entry limit return explicit partial results", async () =>
  fixture(async (root) => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        writeFile(path.join(root, `${i}.txt`), "x"),
      ),
    );
    const controller = new AbortController();
    controller.abort();
    const cancelled = await new ScanIndex().scan(root, {
      signal: controller.signal,
    });
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.files, 0);
    const limited = await new ScanIndex().scan(root, { maxEntries: 10 });
    assert.equal(limited.state, "limited");
    assert.equal(limited.entries, 10);
    assert.equal(limited.root.logical, 9);
  }));
test("cancellation interrupts an in-flight traversal and retains discovered entries", async () =>
  fixture(async (root) => {
    await Promise.all(
      Array.from({ length: 300 }, (_, i) =>
        writeFile(path.join(root, `${i}.dat`), "x"),
      ),
    );
    const index = new ScanIndex(),
      controller = new AbortController();
    let done = false;
    const scan = index.scan(root, { signal: controller.signal }).finally(() => {
      done = true;
    });
    while (index.nodes.length < 10 && !done)
      await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    const result = await scan;
    assert.equal(result.state, "cancelled");
    assert.ok(result.files > 0 && result.files < 300);
    assert.equal(result.root.logical, result.files);
  }));
test(
  "unreadable directories produce visible partial subtree warnings",
  { skip: process.platform === "win32" || process.getuid?.() === 0 },
  async () =>
    fixture(async (root) => {
      const directory = path.join(root, "locked");
      await mkdir(directory);
      await writeFile(path.join(directory, "secret"), "secret");
      await chmod(directory, 0);
      try {
        const index = new ScanIndex();
        const result = await index.scan(root);
        assert.ok(result.issues > 0);
        assert.equal(result.root.logical, 0);
        assert.ok(index.nodes.find((node) => node.name === "locked")?.issue);
        assert.ok(result.root.issue);
      } finally {
        await chmod(directory, 0o700);
      }
    }),
);
test("map payload groups huge fanout while query pagination stays exact", async () =>
  fixture(async (root) => {
    await Promise.all(
      Array.from({ length: 180 }, (_, i) =>
        writeFile(path.join(root, `file-${i}.txt`), Buffer.alloc(i + 1)),
      ),
    );
    const index = new ScanIndex();
    await index.scan(root);
    const view = index.query(queryFor(index, { offset: 100 }));
    assert.equal(view.total, 180);
    assert.equal(view.entries.length, 80);
    assert.equal(view.map.length, 70);
    assert.equal(view.mapOmitted, 110);
    assert.ok(
      view.map.reduce((n, item) => n + item.logical, 0) < view.parent.logical,
    );
  }));
test("missing roots fail clearly", async () => {
  await assert.rejects(
    () =>
      new ScanIndex().scan(
        path.join(os.tmpdir(), "spacescan-nonexistent-root-01"),
      ),
    /ENOENT/,
  );
});
test(
  "macOS startup selection targets the writable Data volume",
  { skip: process.platform !== "darwin" },
  async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await new ScanIndex().scan("/", {
      signal: controller.signal,
    });
    assert.equal(result.rootPath, "/System/Volumes/Data");
    assert.equal(result.state, "cancelled");
    assert.equal(result.files, 0);
  },
);
