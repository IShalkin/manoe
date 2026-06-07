import { createRateLimiter } from "../utils/rateLimiter";

describe("createRateLimiter (real shipped logic)", () => {
  it("should limit concurrent executions", async () => {
    const limiter = createRateLimiter(2);
    const executionOrder: number[] = [];
    const delays = [100, 50, 25];

    const tasks = delays.map((delay, index) =>
      limiter(async () => {
        executionOrder.push(index);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return index;
      })
    );

    const results = await Promise.all(tasks);

    expect(results).toEqual([0, 1, 2]);
    // First two should start immediately (index 0 and 1)
    expect(executionOrder[0]).toBe(0);
    expect(executionOrder[1]).toBe(1);
  });

  it("should handle errors without blocking queue", async () => {
    const limiter = createRateLimiter(1);
    const results: (string | Error)[] = [];

    const task1 = limiter(async () => {
      throw new Error("Task 1 failed");
    }).catch((e) => e as Error);

    const task2 = limiter(async () => {
      return "Task 2 succeeded";
    });

    results.push(await task1);
    results.push(await task2);

    expect(results[0]).toBeInstanceOf(Error);
    expect(results[1]).toBe("Task 2 succeeded");
  });

  it("should allow all tasks when concurrency is high", async () => {
    const limiter = createRateLimiter(10);
    const startTimes: number[] = [];
    const start = Date.now();

    const tasks = Array(5)
      .fill(null)
      .map(() =>
        limiter(async () => {
          startTimes.push(Date.now() - start);
          await new Promise((resolve) => setTimeout(resolve, 50));
        })
      );

    await Promise.all(tasks);

    // All should start nearly simultaneously (within 20ms)
    const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
    expect(maxStartDiff).toBeLessThan(20);
  });
});
