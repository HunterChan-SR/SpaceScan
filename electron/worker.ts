import { parentPort } from "node:worker_threads";
import { ScanIndex } from "./scanner";
import { trashEligibility, validateTrash } from "./safety";
import type { ViewQuery } from "../src/shared/types";
import { exportCSV } from "./export";
if (!parentPort) throw new Error("Scanner requires a worker.");
const port = parentPort;
let index: ScanIndex | null = null;
let controller: AbortController | null = null;
let scanning = false;
interface Request {
  id: number;
  method: string;
  args: Record<string, unknown>;
}
port.on("message", async ({ id, method, args }: Request) => {
  try {
    if (method === "cancel") {
      controller?.abort();
      port.postMessage({ id, value: null });
      return;
    }
    if (method === "scan") {
      if (scanning) throw new Error("Scan already in progress.");
      scanning = true;
      controller = new AbortController();
      index = new ScanIndex();
      // Show a cancellable scan before resolving the selected location. A slow or
      // disconnected volume may stall in realpath/lstat before traversal begins.
      port.postMessage({
        event: "progress",
        value: {
          scanId: index.scanId,
          state: "scanning",
          rootPath: String(args.path),
          entries: 0,
          files: 0,
          bytes: 0,
          elapsedMs: 0,
          currentPath: String(args.path),
          issues: 0,
        },
      });
      port.postMessage({ id, value: null });
      try {
        await index.scan(String(args.path), {
          signal: controller.signal,
          onProgress: (progress) =>
            port.postMessage({ event: "progress", value: progress }),
        });
      } catch (error) {
        port.postMessage({
          event: "progress",
          value: {
            scanId: index.scanId,
            state: "failed",
            rootPath: String(args.path),
            entries: 0,
            files: 0,
            bytes: 0,
            elapsedMs: 0,
            currentPath: "",
            issues: 0,
            message: String(error),
          },
        });
      } finally {
        scanning = false;
      }
      return;
    }
    if (scanning) throw new Error("Wait for the scan to finish.");
    if (method === "summary") {
      port.postMessage({ id, value: index?.result ?? null });
      return;
    }
    if (!index?.result) throw new Error("Scan a folder first.");
    if (args.scanId !== index.scanId)
      throw new Error("This result belongs to an older scan.");
    let value: unknown;
    switch (method) {
      case "view":
        value = index.query(args as unknown as ViewQuery);
        break;
      case "details": {
        const nodeId = Number(args.nodeId);
        const eligibility = trashEligibility(index, nodeId, String(args.home));
        value = {
          entry: index.publicEntry(nodeId),
          path: index.getPath(nodeId),
          canTrash: eligibility.allowed,
          reason: eligibility.reason,
        };
        break;
      }
      case "validateTrash":
        value = await validateTrash(
          index,
          Number(args.nodeId),
          String(args.home),
        );
        break;
      case "export": {
        const query = args.query as ViewQuery;
        await exportCSV(index, query, String(args.destination));
        value = true;
        break;
      }
      default:
        throw new Error("Unknown scanner operation.");
    }
    port.postMessage({ id, value });
  } catch (error) {
    port.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
