import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ScanIndex } from "./scanner";
import type { ViewQuery } from "../src/shared/types";
import { csvCell } from "./csv";

export async function exportCSV(
  index: ScanIndex,
  query: ViewQuery,
  destination: string,
): Promise<void> {
  if (!index.result || index.scanId !== query.scanId)
    throw new Error("Scan changed. Export the current result instead.");
  // Write beside the destination and replace it only after all bytes are durable.
  // A failed export must not truncate a previously saved report.
  const temporary = path.join(
    path.dirname(destination),
    `.spacescan-${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx", 0o600);
  let closed = false;
  try {
    const ids = index.matching(query).sort(index.comparator(query));
    let batch =
      "\uFEFFPath,Kind,Logical bytes,Estimated allocated bytes,Files,Modified,Status\r\n";
    for (const id of ids) {
      const node = index.getNode(id);
      batch +=
        [
          index.getPath(id),
          node.kind,
          node.logical,
          index.result.allocatedSupported ? node.allocated : "",
          node.files,
          new Date(node.modified).toISOString(),
          node.issue ?? "",
        ]
          .map(csvCell)
          .join(",") + "\r\n";
      if (batch.length >= 65536) {
        await file.writeFile(batch);
        batch = "";
      }
    }
    if (batch) await file.writeFile(batch);
    await file.sync();
    await file.close();
    closed = true;
    await rename(temporary, destination);
  } finally {
    if (!closed) await file.close();
    await rm(temporary, { force: true });
  }
}
