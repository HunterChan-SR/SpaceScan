import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../electron/timeout";
test("unresponsive disk metadata does not block indefinitely", async () => {
  await assert.rejects(
    withTimeout(new Promise<never>(() => {}), 10),
    /timed out/,
  );
});
test("disk metadata results and real IO errors are preserved", async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 100), 42);
  await assert.rejects(
    withTimeout(Promise.reject(new Error("EIO")), 100),
    /EIO/,
  );
});
