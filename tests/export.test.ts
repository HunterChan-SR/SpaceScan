import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ScanIndex } from "../electron/scanner";
import { exportCSV } from "../electron/export";
import type { ViewQuery } from "../src/shared/types";

test("CSV export preserves all batches, filtered scope, Unicode and existing reports on failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "spacescan-export-"));
  try {
    const source = path.join(root, "files");
    await mkdir(source);
    await Promise.all(
      Array.from({ length: 600 }, (_, i) =>
        writeFile(path.join(source, `${i}-报告.txt`), "abc"),
      ),
    );
    const index = new ScanIndex();
    await index.scan(source);
    const query: ViewQuery = {
      scanId: index.scanId,
      parentId: 0,
      metric: "logical",
      sort: "name",
      descending: false,
      search: "",
      category: "all",
      offset: 100,
      limit: 100,
    };
    const destination = path.join(root, "export.csv");
    await writeFile(destination, "older report");
    await exportCSV(index, query, destination);
    const csv = await readFile(destination, "utf8");
    assert.equal(csv.split("\r\n").length, 602);
    assert.ok(csv.includes("0-报告.txt"));
    assert.ok(csv.includes("599-报告.txt"));
    await exportCSV(index, { ...query, search: "599-" }, destination);
    const filtered = await readFile(destination, "utf8");
    assert.equal(filtered.split("\r\n").length, 3);
    index.getNode(1).modified = NaN;
    await assert.rejects(exportCSV(index, query, destination), RangeError);
    assert.equal(await readFile(destination, "utf8"), filtered);
    assert.deepEqual((await readdir(root)).sort(), ["export.csv", "files"]);
    await assert.rejects(
      exportCSV(index, { ...query, scanId: "old" }, destination),
      /Scan changed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
