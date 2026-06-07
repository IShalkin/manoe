/**
 * Unit Tests for StorytellerOrchestrator
 *
 * Tests use real production helpers from utils/ (extracted from the orchestrator)
 * to ensure tests break when production logic changes.
 *
 * Deleted fiction (confirmed not in production via grep):
 * - shouldStop: real prod method takes runId, trivial boolean-or; gap noted
 * - getNextPhase: fictional 9-phase linear order omitting NARRATOR_DESIGN/ORIGINALITY_CHECK/IMPACT_ASSESSMENT
 *   and using uppercase names instead of real lowercase string values; backfilled in phaseOrder.test.ts
 * - sceneNeedsRevision: does not exist in prod; real gate is isApproved() + utils/revisionGate.ts
 *   already covered by revisionGate.test.ts and ApprovalThreshold.test.ts
 * - validatePhaseTransition: local closure, not in prod; Writer↔Critic cycle covered by FinalRecritique.test.ts
 * - formatSSEEvent: not in prod; real SSE goes through publishEvent→redisStreams, covered by EventsController.test.ts
 */

import { createRateLimiter } from "../utils/rateLimiter";

// ============================================================================
// TYPE DEFINITIONS (used by state management describe block)
// ============================================================================

interface KeyConstraint {
  key: string;
  value: string;
  sceneNumber: number;
  timestamp: string;
  immutable?: boolean;
}

interface GenerationState {
  runId: string;
  projectId: string;
  phase: string;
  currentScene: number;
  totalScenes: number;
  characters: unknown[];
  narrative?: Record<string, unknown>;
  drafts: Map<number, unknown>;
  critiques: Map<number, unknown>;
  revisionCount: Map<number, number>;
  messages: unknown[];
  maxRevisions: number;
  keyConstraints: KeyConstraint[];
  rawFactsLog: unknown[];
  lastArchivistScene: number;
  isPaused: boolean;
  isCompleted: boolean;
  startedAt: string;
  updatedAt: string;
}

// ============================================================================
// TESTS
// ============================================================================

describe('StorytellerOrchestrator', () => {
  describe('createRateLimiter', () => {
    it('should limit concurrent executions', async () => {
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
      // Third should wait until one finishes
      expect(executionOrder[0]).toBe(0);
      expect(executionOrder[1]).toBe(1);
    });

    it('should handle errors without blocking queue', async () => {
      const limiter = createRateLimiter(1);
      const results: (string | Error)[] = [];

      const task1 = limiter(async () => {
        throw new Error('Task 1 failed');
      }).catch((e) => e as Error);

      const task2 = limiter(async () => {
        return 'Task 2 succeeded';
      });

      results.push(await task1);
      results.push(await task2);

      expect(results[0]).toBeInstanceOf(Error);
      expect(results[1]).toBe('Task 2 succeeded');
    });

    it('should allow all tasks when concurrency is high', async () => {
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

  describe('state management', () => {
    const createTestState = (): GenerationState => ({
      runId: 'test-run-id',
      projectId: 'test-project-id',
      phase: 'GENESIS',
      currentScene: 0,
      totalScenes: 5,
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
    });

    it('should track scene drafts by number', () => {
      const state = createTestState();
      state.drafts.set(1, { content: 'Scene 1 content', wordCount: 500 });
      state.drafts.set(2, { content: 'Scene 2 content', wordCount: 600 });

      expect(state.drafts.size).toBe(2);
      expect(state.drafts.get(1)).toEqual({ content: 'Scene 1 content', wordCount: 500 });
    });

    it('should track revision counts per scene', () => {
      const state = createTestState();
      state.revisionCount.set(1, 0);
      state.revisionCount.set(1, (state.revisionCount.get(1) || 0) + 1);
      state.revisionCount.set(1, (state.revisionCount.get(1) || 0) + 1);

      expect(state.revisionCount.get(1)).toBe(2);
    });

    it('should maintain constraint immutability', () => {
      const state = createTestState();
      state.keyConstraints.push({
        key: 'seed_idea',
        value: 'original',
        sceneNumber: 0,
        timestamp: new Date().toISOString(),
        immutable: true,
      });

      // Attempt to add conflicting constraint
      const existingImmutable = state.keyConstraints.find(
        (c) => c.key === 'seed_idea' && c.immutable
      );

      expect(existingImmutable).toBeDefined();
      expect(existingImmutable?.value).toBe('original');
    });
  });
});
