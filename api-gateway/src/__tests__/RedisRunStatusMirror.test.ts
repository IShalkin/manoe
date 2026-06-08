/**
 * Tests for RedisStreamsService run-status mirror helpers (issue #157, Slice A).
 *
 * setRunStatus / getRunStatusMirror are hash-based Redis operations that allow
 * any replica to answer run status/stream existence checks for a live run
 * without holding it in the local heap.
 */

import type { RunStatusMirror } from "../services/RedisStreamsService";

// ---------------------------------------------------------------------------
// Fake Redis client backed by an in-memory store
// The mock is defined inside the factory so jest.mock hoisting does not break
// closures. The in-memory store is kept on the fake instance.
// ---------------------------------------------------------------------------
const mockHset = jest.fn();
const mockExpire = jest.fn();
const mockHgetall = jest.fn();

// setRunStatus now writes atomically via multi().hset().expire().exec(). The
// fake `multi()` returns a chainable builder that forwards to the SAME
// mockHset/mockExpire fns (so their call assertions still hold), and exec()
// resolves once both have run.
function makeMulti() {
  const ops: Array<() => Promise<unknown>> = [];
  const builder: Record<string, unknown> = {
    hset: (...args: unknown[]) => {
      ops.push(() => mockHset(...args));
      return builder;
    },
    expire: (...args: unknown[]) => {
      ops.push(() => mockExpire(...args));
      return builder;
    },
    exec: async () => {
      const results = [];
      for (const op of ops) results.push(await op());
      return results;
    },
  };
  return builder;
}

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    hset: mockHset,
    expire: mockExpire,
    hgetall: mockHgetall,
    multi: () => makeMulti(),
    quit: jest.fn().mockResolvedValue("OK"),
  }));
});

jest.mock("../services/MetricsService", () => ({
  MetricsService: class {
    incrementCounter() {}
    recordHistogram() {}
    setGauge() {}
    getMetrics() { return ""; }
    recordAgentExecution() {}
    recordPhaseCompletion() {}
    recordError() {}
  },
}));

// Import AFTER mocks
import { RedisStreamsService } from "../services/RedisStreamsService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRecord(overrides: Partial<RunStatusMirror> = {}): RunStatusMirror {
  return {
    runId: "run-abc",
    projectId: "proj-1",
    phase: "drafting",
    currentScene: 2,
    totalScenes: 5,
    isPaused: false,
    isCompleted: false,
    error: undefined,
    startedAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:05:00.000Z",
    ...overrides,
  };
}

describe("RedisStreamsService – run-status mirror (issue #157 Slice A)", () => {
  let svc: RedisStreamsService;
  // In-memory store to simulate Redis hashes
  const store: Record<string, Record<string, string>> = {};

  beforeEach(() => {
    // Reset in-memory store and mocks each test
    for (const k of Object.keys(store)) delete store[k];
    mockHset.mockClear();
    mockExpire.mockClear();
    mockHgetall.mockClear();

    // hset: store key -> field object
    mockHset.mockImplementation((key: string, data: Record<string, string>) => {
      store[key] = { ...(store[key] ?? {}), ...data };
      return Promise.resolve(Object.keys(data).length);
    });

    // expire: just record, no-op for tests
    mockExpire.mockResolvedValue(1);

    // hgetall: return stored hash or null
    mockHgetall.mockImplementation((key: string) => {
      const entry = store[key];
      if (!entry || Object.keys(entry).length === 0) return Promise.resolve(null);
      return Promise.resolve({ ...entry });
    });

    svc = new RedisStreamsService();
  });

  it("setRunStatus flattens booleans/numbers and calls hset + expire", async () => {
    const record = makeRecord({ isPaused: true, currentScene: 3 });
    await svc.setRunStatus(record, 3600);

    expect(mockHset).toHaveBeenCalledTimes(1);
    const [key, flat] = mockHset.mock.calls[0] as [string, Record<string, string>];
    expect(key).toBe("manoe:run_status:run-abc");
    expect(flat.isPaused).toBe("1");
    expect(flat.isCompleted).toBe("0");
    expect(flat.currentScene).toBe("3");
    expect(flat.totalScenes).toBe("5");
    expect(flat.phase).toBe("drafting");

    expect(mockExpire).toHaveBeenCalledWith("manoe:run_status:run-abc", 3600);
  });

  it("setRunStatus uses default TTL of 21600 when not specified", async () => {
    await svc.setRunStatus(makeRecord());
    expect(mockExpire).toHaveBeenCalledWith("manoe:run_status:run-abc", 21600);
  });

  it("getRunStatusMirror round-trips a written record with correct types", async () => {
    const record = makeRecord({ isPaused: true, isCompleted: false, currentScene: 4 });
    await svc.setRunStatus(record);

    const result = await svc.getRunStatusMirror("run-abc");
    expect(result).not.toBeNull();
    expect(result!.runId).toBe("run-abc");
    expect(result!.projectId).toBe("proj-1");
    expect(result!.phase).toBe("drafting");
    expect(result!.currentScene).toBe(4);
    expect(result!.totalScenes).toBe(5);
    expect(result!.isPaused).toBe(true);
    expect(result!.isCompleted).toBe(false);
    expect(result!.startedAt).toBe("2026-06-07T10:00:00.000Z");
    expect(result!.updatedAt).toBe("2026-06-07T10:05:00.000Z");
  });

  it("getRunStatusMirror returns null for an empty/missing hash", async () => {
    const result = await svc.getRunStatusMirror("no-such-run");
    expect(result).toBeNull();
  });

  it("getRunStatusMirror returns undefined for optional error when empty string stored", async () => {
    await svc.setRunStatus(makeRecord({ error: undefined }));
    const result = await svc.getRunStatusMirror("run-abc");
    expect(result!.error).toBeUndefined();
  });

  it("getRunStatusMirror returns the error string when set", async () => {
    await svc.setRunStatus(makeRecord({ error: "LLM timeout" }));
    const result = await svc.getRunStatusMirror("run-abc");
    expect(result!.error).toBe("LLM timeout");
  });
});
