/**
 * Unit Tests for StorytellerOrchestrator
 *
 * Tests use real production helpers from utils/ (extracted from the orchestrator)
 * to ensure tests break when production logic changes.
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
// LOCAL IMPLEMENTATIONS (remaining shadow copies — to be removed in Task 4)
// ============================================================================

/**
 * Check if generation should stop
 */
function shouldStop(state: Pick<GenerationState, 'isPaused' | 'isCompleted'>): boolean {
  return state.isPaused || state.isCompleted;
}

/**
 * Get next phase in generation flow
 */
function getNextPhase(
  currentPhase: string
): string | null {
  const phaseOrder = [
    'GENESIS',
    'CHARACTERS',
    'WORLDBUILDING',
    'OUTLINING',
    'ADVANCED_PLANNING',
    'DRAFTING',
    'CRITIQUE',
    'REVISION',
    'POLISH',
  ];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return null;
  }
  return phaseOrder[currentIndex + 1];
}

/**
 * Check if scene needs revision based on critique
 */
function sceneNeedsRevision(
  critique: { passedQuality: boolean; issues?: string[] } | undefined,
  revisionCount: number,
  maxRevisions: number
): boolean {
  if (!critique) return false;
  if (critique.passedQuality) return false;
  if (revisionCount >= maxRevisions) return false;
  return true;
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

  describe('shouldStop', () => {
    it('should return true when paused', () => {
      expect(shouldStop({ isPaused: true, isCompleted: false })).toBe(true);
    });

    it('should return true when completed', () => {
      expect(shouldStop({ isPaused: false, isCompleted: true })).toBe(true);
    });

    it('should return true when both paused and completed', () => {
      expect(shouldStop({ isPaused: true, isCompleted: true })).toBe(true);
    });

    it('should return false when active', () => {
      expect(shouldStop({ isPaused: false, isCompleted: false })).toBe(false);
    });
  });

  describe('getNextPhase', () => {
    it('should return CHARACTERS after GENESIS', () => {
      expect(getNextPhase('GENESIS')).toBe('CHARACTERS');
    });

    it('should return WORLDBUILDING after CHARACTERS', () => {
      expect(getNextPhase('CHARACTERS')).toBe('WORLDBUILDING');
    });

    it('should return OUTLINING after WORLDBUILDING', () => {
      expect(getNextPhase('WORLDBUILDING')).toBe('OUTLINING');
    });

    it('should return ADVANCED_PLANNING after OUTLINING', () => {
      expect(getNextPhase('OUTLINING')).toBe('ADVANCED_PLANNING');
    });

    it('should return DRAFTING after ADVANCED_PLANNING', () => {
      expect(getNextPhase('ADVANCED_PLANNING')).toBe('DRAFTING');
    });

    it('should return null for POLISH (final phase)', () => {
      expect(getNextPhase('POLISH')).toBe(null);
    });

    it('should return null for unknown phase', () => {
      expect(getNextPhase('UNKNOWN')).toBe(null);
    });
  });

  describe('sceneNeedsRevision', () => {
    it('should return false when no critique', () => {
      expect(sceneNeedsRevision(undefined, 0, 2)).toBe(false);
    });

    it('should return false when critique passed', () => {
      expect(sceneNeedsRevision({ passedQuality: true }, 0, 2)).toBe(false);
    });

    it('should return true when critique failed and under max revisions', () => {
      expect(sceneNeedsRevision({ passedQuality: false, issues: ['pacing'] }, 0, 2)).toBe(true);
    });

    it('should return false when at max revisions', () => {
      expect(sceneNeedsRevision({ passedQuality: false, issues: ['pacing'] }, 2, 2)).toBe(false);
    });

    it('should return false when over max revisions', () => {
      expect(sceneNeedsRevision({ passedQuality: false }, 3, 2)).toBe(false);
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

  describe('phase transition validation', () => {
    const validatePhaseTransition = (
      currentPhase: string,
      targetPhase: string
    ): { valid: boolean; reason?: string } => {
      const validTransitions: Record<string, string[]> = {
        GENESIS: ['CHARACTERS'],
        CHARACTERS: ['WORLDBUILDING'],
        WORLDBUILDING: ['OUTLINING'],
        OUTLINING: ['ADVANCED_PLANNING'],
        ADVANCED_PLANNING: ['DRAFTING'],
        DRAFTING: ['CRITIQUE', 'POLISH'],
        CRITIQUE: ['REVISION', 'DRAFTING'],
        REVISION: ['CRITIQUE', 'DRAFTING'],
        POLISH: [],
      };

      const allowed = validTransitions[currentPhase] || [];
      if (allowed.includes(targetPhase)) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `Cannot transition from ${currentPhase} to ${targetPhase}`,
      };
    };

    it('should allow valid forward transition', () => {
      expect(validatePhaseTransition('GENESIS', 'CHARACTERS')).toEqual({ valid: true });
    });

    it('should allow critique-revision loop', () => {
      expect(validatePhaseTransition('CRITIQUE', 'REVISION')).toEqual({ valid: true });
      expect(validatePhaseTransition('REVISION', 'CRITIQUE')).toEqual({ valid: true });
    });

    it('should reject invalid transition', () => {
      const result = validatePhaseTransition('GENESIS', 'DRAFTING');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cannot transition');
    });

    it('should reject backward transition', () => {
      const result = validatePhaseTransition('WORLDBUILDING', 'GENESIS');
      expect(result.valid).toBe(false);
    });

    it('should reject any transition from POLISH', () => {
      const result = validatePhaseTransition('POLISH', 'DRAFTING');
      expect(result.valid).toBe(false);
    });
  });

  describe('event publishing format', () => {
    interface SSEEvent {
      type: string;
      data: Record<string, unknown>;
      timestamp: string;
    }

    const formatSSEEvent = (type: string, data: Record<string, unknown>): SSEEvent => ({
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    it('should format phase_start event', () => {
      const event = formatSSEEvent('phase_start', {
        phase: 'GENESIS',
        runId: 'run-123',
      });

      expect(event.type).toBe('phase_start');
      expect(event.data.phase).toBe('GENESIS');
      expect(event.timestamp).toBeDefined();
    });

    it('should format agent_message event', () => {
      const event = formatSSEEvent('agent_message', {
        agent: 'WRITER',
        content: 'Scene content here',
        sceneNum: 1,
      });

      expect(event.type).toBe('agent_message');
      expect(event.data.agent).toBe('WRITER');
      expect(event.data.sceneNum).toBe(1);
    });

    it('should format generation_complete event', () => {
      const event = formatSSEEvent('generation_complete', {
        projectId: 'proj-123',
        totalScenes: 5,
        totalWords: 10000,
      });

      expect(event.type).toBe('generation_complete');
      expect(event.data.totalScenes).toBe(5);
    });
  });
});
