/**
 * Shared Test Setup and Mock Patterns
 *
 * This file provides consistent mocking patterns for all tests in the API Gateway.
 * Import these mocks in your test files for unified behavior.
 */

// ============================================================================
// REDIS MOCK
// ============================================================================

export interface MockRedisClient {
  get: jest.Mock;
  set: jest.Mock;
  setex: jest.Mock;
  del: jest.Mock;
  xadd: jest.Mock;
  xread: jest.Mock;
  hget: jest.Mock;
  hset: jest.Mock;
  quit: jest.Mock;
  on: jest.Mock;
}

export function createMockRedisClient(): MockRedisClient {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    xadd: jest.fn().mockResolvedValue('1234567890-0'),
    xread: jest.fn().mockResolvedValue(null),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
  };
}

// ============================================================================
// SUPABASE MOCK
// ============================================================================

export interface MockSupabaseResponse<T = unknown> {
  data: T | null;
  error: null | { message: string; code: string };
}

export interface MockSupabaseQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  single: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  then: jest.Mock;
}

export function createMockSupabaseClient() {
  const queryBuilder: MockSupabaseQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: jest.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
  };

  return {
    from: jest.fn().mockReturnValue(queryBuilder),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };
}

// ============================================================================
// LLM PROVIDER MOCK
// ============================================================================

export interface MockLLMResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function createMockLLMProvider() {
  return {
    createCompletionWithRetry: jest.fn().mockResolvedValue({
      content: '{"result": "test"}',
      model: 'gpt-4',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    } as MockLLMResponse),
  };
}

// ============================================================================
// LANGFUSE MOCK
// ============================================================================

export function createMockLangfuse() {
  return {
    startTrace: jest.fn(),
    endTrace: jest.fn(),
    startSpan: jest.fn().mockReturnValue('span-id-123'),
    endSpan: jest.fn(),
    addEvent: jest.fn(),
    trackLLMCall: jest.fn(),
    getPrompt: jest.fn().mockResolvedValue({ compile: jest.fn().mockReturnValue('prompt text') }),
  };
}

// ============================================================================
// REDIS STREAMS MOCK
// ============================================================================

export function createMockRedisStreams() {
  return {
    publishEvent: jest.fn().mockResolvedValue('event-id-123'),
    subscribeToRun: jest.fn(),
    unsubscribeFromRun: jest.fn(),
  };
}

// ============================================================================
// QDRANT MOCK
// ============================================================================

export function createMockQdrant() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    storeMemory: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
    deleteByRunId: jest.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// METRICS SERVICE MOCK
// ============================================================================

export function createMockMetricsService() {
  return {
    recordAgentExecution: jest.fn(),
    recordPhaseCompletion: jest.fn(),
    recordError: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({}),
  };
}

// ============================================================================
// AGENT FACTORY MOCK
// ============================================================================

export function createMockAgentFactory() {
  const mockAgent = {
    execute: jest.fn().mockResolvedValue({
      content: { test: 'output' },
      keyConstraints: [],
    }),
  };

  return {
    getAgent: jest.fn().mockReturnValue(mockAgent),
  };
}

// ============================================================================
// GENERATION STATE FACTORY
// ============================================================================

export function createMockGenerationState(overrides: Partial<{
  runId: string;
  projectId: string;
  phase: string;
  currentScene: number;
  totalScenes: number;
}> = {}) {
  return {
    runId: overrides.runId || 'test-run-id',
    projectId: overrides.projectId || 'test-project-id',
    phase: overrides.phase || 'GENESIS',
    currentScene: overrides.currentScene || 0,
    totalScenes: overrides.totalScenes || 5,
    characters: [],
    drafts: new Map(),
    critiques: new Map(),
    revisionCount: new Map(),
    messages: [],
    maxRevisions: 2,
    keyConstraints: [],
    rawFactsLog: [],
    lastArchivistScene: 0,
    isPaused: false,
    isCompleted: false,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// CONSOLE SUPPRESSION (for cleaner test output)
// ============================================================================

export function suppressConsole() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  beforeAll(() => {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  return originalConsole;
}

// ============================================================================
// GLOBAL TEST UTILITIES
// ============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a deferred promise for async testing
 */
export function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}
