export type ShutdownStep = {
  name: string;
  run: () => void | Promise<void>;
};
export type ShutdownReport = { failed: string[] };

/** Runs every cleanup step in order. A throwing or hanging step is recorded by name
 * only (never its message) and can never skip the steps after it. */
export async function runShutdown(
  steps: readonly ShutdownStep[],
  stepTimeoutMs = 8000,
): Promise<ShutdownReport> {
  const failed: string[] = [];
  for (const step of steps) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(step.run),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), stepTimeoutMs);
        }),
      ]);
    } catch {
      failed.push(step.name);
    } finally {
      clearTimeout(timer);
    }
  }
  return { failed };
}
