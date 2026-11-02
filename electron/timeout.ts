/** Optional disk metadata must not hold startup or completed scans indefinitely. */
export async function withTimeout<T>(
  operation: Promise<T>,
  milliseconds = 1500,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Disk metadata request timed out.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
