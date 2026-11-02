import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  rm,
  rename,
  mkdir,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ScanIndex } from "../electron/scanner";
import {
  isWithin,
  protectedPath,
  trashEligibility,
  validateTrash,
} from "../electron/safety";
import { csvCell } from "../electron/csv";
test("scope boundaries handle Windows drives, case and sibling prefixes", () => {
  assert.equal(isWithin("/home/me", "/home/me/docs", "linux"), true);
  assert.equal(isWithin("/home/me", "/home/mean", "linux"), false);
  assert.equal(isWithin("C:\\Users\\Me", "c:\\users\\me\\Docs", "win32"), true);
  assert.equal(isWithin("C:\\Users\\Me", "D:\\Users\\Me", "win32"), false);
  assert.equal(
    protectedPath("C:\\Windows\\System32", "C:\\Users\\me", "win32"),
    true,
  );
  assert.equal(protectedPath("/Users/me", "/Users/me", "darwin"), true);
  assert.equal(protectedPath("/Users", "/Users/me", "darwin"), true);
  assert.equal(
    protectedPath("/Users/me/Downloads/archive.zip", "/Users/me", "darwin"),
    false,
  );
  assert.equal(protectedPath("/System/Library", "/Users/me", "darwin"), true);
  assert.equal(
    protectedPath(
      "/System/Volumes/Data/Users/me/Downloads/file.zip",
      "/Users/me",
      "darwin",
    ),
    false,
  );
  assert.equal(
    protectedPath("/System/Volumes/Data/Users/me", "/Users/me", "darwin"),
    true,
  );
  assert.equal(
    protectedPath("/System/Volumes/Data/Library", "/Users/me", "darwin"),
    true,
  );
});
test("only current, complete entries can be offered for Trash", async () => {
  const root = await mkdtemp(
    path.join(
      process.platform === "darwin" ? "/tmp" : os.tmpdir(),
      "spacescan-safety-",
    ),
  );
  try {
    const file = path.join(root, "file.txt");
    await writeFile(file, "hello");
    const index = new ScanIndex();
    await index.scan(root);
    const entry = index.nodes.find((node) => node.name === "file.txt")!;
    assert.equal(trashEligibility(index, 0, os.homedir()).allowed, false);
    assert.equal(
      await validateTrash(index, entry.id, os.homedir()),
      index.getPath(entry.id),
    );
    await rename(file, path.join(root, "old.txt"));
    await writeFile(file, "replacement");
    await assert.rejects(
      () => validateTrash(index, entry.id, os.homedir()),
      /changed/,
    );
    const cancelled = new ScanIndex();
    const controller = new AbortController();
    await cancelled.scan(root, {
      onProgress: (progress) => {
        if (progress.entries > 0) controller.abort();
      },
      signal: controller.signal,
    });
    assert.equal(trashEligibility(cancelled, 0, os.homedir()).allowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test(
  "replaced ancestors cannot redirect a Trash action",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(
      path.join(
        process.platform === "darwin" ? "/tmp" : os.tmpdir(),
        "spacescan-ancestor-",
      ),
    );
    try {
      const folder = path.join(root, "folder");
      await mkdir(folder);
      await writeFile(path.join(folder, "file"), "x");
      const index = new ScanIndex();
      await index.scan(root);
      const entry = index.nodes.find((node) => node.name === "file")!;
      await rename(folder, path.join(root, "old"));
      await symlink(path.join(root, "old"), folder);
      await assert.rejects(
        () => validateTrash(index, entry.id, os.homedir()),
        /location changed/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
test("CSV escapes quotes, newlines and spreadsheet formulas", () => {
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(csvCell("=SUM(1,2)"), '"\'=SUM(1,2)"');
  assert.equal(csvCell("  @cmd"), '"\'  @cmd"');
  assert.equal(csvCell(123), '"123"');
});
