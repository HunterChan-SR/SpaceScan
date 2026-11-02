import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ScanIndex } from "../electron/scanner";
const count = Number(process.env.SPACESCAN_BENCH_FILES ?? 20000);
if (!Number.isInteger(count) || count < 100 || count > 1_000_000)
  throw new Error("SPACESCAN_BENCH_FILES must be between 100 and 1000000.");
const root = await mkdtemp(path.join(os.tmpdir(), "spacescan-benchmark-"));
try {
  for (let batch = 0; batch < Math.ceil(count / 100); batch++) {
    const directory = path.join(root, `directory-${batch}`);
    await mkdir(directory);
    await Promise.all(
      Array.from({ length: Math.min(100, count - batch * 100) }, (_, i) =>
        writeFile(path.join(directory, `${i}.txt`), "SpaceScan benchmark"),
      ),
    );
  }
  const index = new ScanIndex();
  const start = performance.now();
  const result = await index.scan(root);
  const queryStart = performance.now();
  const view = index.query({
    scanId: index.scanId,
    parentId: 0,
    metric: "logical",
    sort: "size",
    descending: true,
    search: "9",
    category: "all",
    offset: 0,
    limit: 100,
  });
  console.log(
    JSON.stringify(
      {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        files: result.files,
        entries: result.entries,
        scanMs: Math.round(queryStart - start),
        queryMs: Math.round(performance.now() - queryStart),
        rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        queryPayloadKiB: Math.round(
          Buffer.byteLength(JSON.stringify(view)) / 1024,
        ),
        issues: result.issues,
      },
      null,
      2,
    ),
  );
  if (result.files !== count || result.issues !== 0)
    throw new Error("Benchmark lost files.");
} finally {
  await rm(root, { recursive: true, force: true });
}
