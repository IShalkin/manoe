/**
 * Concurrency-limiting semaphore, extracted from StorytellerOrchestrator so the
 * orchestrator and the unit test exercise the SAME code. No `this`, no services.
 *
 * Returns a function that wraps an async thunk; at most `concurrency` thunks run
 * at once, the rest queue and start as slots free up (in submission order).
 */
export function createRateLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && activeCount < concurrency) {
      activeCount++;
      const resolve = queue.shift()!;
      resolve();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        // Wrap in Promise.resolve().then so a SYNCHRONOUS throw from fn() becomes
        // a rejection that still hits .finally — otherwise the slot leaks.
        Promise.resolve()
          .then(fn)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            activeCount--;
            next();
          });
      };

      if (activeCount < concurrency) {
        activeCount++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
