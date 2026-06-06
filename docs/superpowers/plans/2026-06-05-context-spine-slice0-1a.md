# Context Spine — Slice 0 + 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close MANOE's four confirmed open context loops by (a) failing closed on noise embeddings and (b) wiring the already-computed `worldState` and `advancedPlan` into the Writer and Critic prompts, fixing the dead Critic guard fields and the inconsistent approval threshold, and re-scoring the final revision so sub-threshold scenes are flagged instead of silently accepted.

**Architecture:** Pure read-wiring + correctness fixes against existing machinery — no new agents, no embedding infra, no extra generation passes. Two new shared render helpers on `BaseAgent` (`buildWorldStateBlock`, `buildAdvancedPlanBlock`) are consumed by both `WriterAgent` and `CriticAgent`. The `advancedPlan` gains a home on `GenerationState`; the Strategist phase persists it. `CritiqueSchema` gains the two fields its guard clauses already read. `isApproved` unifies on a single threshold constant. `runDraftingLoop` gets a score-only final re-critique.

**Tech Stack:** TypeScript, Ts.ED (DI + `@tsed/schema` decorators), Jest + ts-jest (tests in `api-gateway/src/__tests__/**/*.test.ts`), Zod (schemas), Qdrant client. All commands run from `api-gateway/`.

**Scope note:** This plan is Slice 0 + Slice 1a only. The design doc's Slice 1a mentioned `narratorVoice` injection — deferred to Slice 2, because narratorVoice has no home in `state` today (it belongs on the not-yet-built `StoryBible.narratorVoice`). The two fields concretely present in state now are `worldState` (built by Archivist, never read) and `advancedPlan` (computed by Strategist, never persisted) — those are what 1a wires. Slices 1b/2/3/4/5 get their own plans.

**Design doc:** `docs/superpowers/specs/2026-06-05-agent-context-spine-design.md`

---

## Running tests on Windows (read first)

Jest cold start is slow on this machine (~60-300s for a single suite). Run one suite at a time by filename:

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest <TestFileName> > /tmp/jestout.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|PASS|FAIL" /tmp/jestout.txt; rm -f /tmp/jestout.txt
```

Every agent/orchestrator test MUST start with the `jest.mock("../services/LangfuseService", …)` factory (the `langfuse` package does a dynamic `import()` at module-eval that Jest's default VM cannot service). Copy the block from any existing test, e.g. `ProfilerAgentValidation.test.ts`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/services/QdrantMemoryService.ts` | vector memory | Modify — fail-closed on LOCAL in the three `searchX` methods |
| `src/models/AgentModels.ts` | state shapes | Modify — add `advancedPlan?` field to `GenerationState` |
| `src/services/StorytellerOrchestrator.ts` | orchestration | Modify — persist `advancedPlan`; unify `isApproved` threshold; final re-critique |
| `src/agents/BaseAgent.ts` | shared agent base | Modify — add `buildWorldStateBlock` + `buildAdvancedPlanBlock` helpers |
| `src/agents/WriterAgent.ts` | prose | Modify — inject worldState + advancedPlan into the DRAFTING prompt |
| `src/agents/CriticAgent.ts` | critique | Modify — inject roster + worldState into the CRITIQUE prompt + rubric note |
| `src/schemas/AgentSchemas.ts` | Zod schemas | Modify — add `wordCountCompliance` + `scopeAdherence` to `CritiqueSchema` |
| `src/__tests__/QdrantFailClosed.test.ts` | test | Create |
| `src/__tests__/AdvancedPlanPersist.test.ts` | test | Create |
| `src/__tests__/BaseAgentContextBlocks.test.ts` | test | Create |
| `src/__tests__/WriterContextInjection.test.ts` | test | Create |
| `src/__tests__/CriticContextInjection.test.ts` | test | Create |
| `src/__tests__/CritiqueSchemaFields.test.ts` | test | Create |
| `src/__tests__/ApprovalThreshold.test.ts` | test | Create |
| `src/__tests__/FinalRecritique.test.ts` | test | Create |

---

## Task 1: Slice 0 — fail closed on LOCAL embeddings

**Why:** `EmbeddingProvider.LOCAL` is the default (`QdrantMemoryService.ts:88`) and produces deterministic *noise* vectors. With the orchestrator's `score>0.5` filter the result is silent empty retrieval (amnesia). Failing closed makes that explicit and removes a dead path so later experiments are interpretable.

**Files:**
- Modify: `src/services/QdrantMemoryService.ts` (methods `searchCharacters` ~:398, `searchWorldbuilding` ~:596, `searchScenes` ~:695)
- Test: `src/__tests__/QdrantFailClosed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/QdrantFailClosed.test.ts`:

```ts
/**
 * Slice 0: when the embedding provider is LOCAL (deterministic noise),
 * vector search must fail CLOSED — return [] without querying Qdrant —
 * rather than ranking over meaningless pseudo-vectors.
 */
import { QdrantMemoryService, EmbeddingProvider } from "../services/QdrantMemoryService";

type AnyObj = Record<string, unknown>;

function makeService(provider: EmbeddingProvider) {
  const svc = new QdrantMemoryService();
  const o = svc as unknown as AnyObj;
  o.embeddingProvider = provider;
  o.embeddingDimension = 3072;
  o.embeddingModel = provider === EmbeddingProvider.LOCAL ? "none" : "text-embedding-3-small";
  // A client whose search() throws if ever called — proves we never query in LOCAL mode.
  const search = jest.fn(async () => { throw new Error("client.search must not be called in LOCAL mode"); });
  o.client = { search };
  o.collectionCharacters = "c";
  o.collectionWorldbuilding = "w";
  o.collectionScenes = "s";
  return { svc, search };
}

describe("QdrantMemoryService fail-closed on LOCAL embeddings", () => {
  it("searchScenes returns [] and does not query the client in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    const res = await svc.searchScenes("proj-1", "anything");
    expect(res).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("searchCharacters returns [] in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    expect(await svc.searchCharacters("proj-1", "q")).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("searchWorldbuilding returns [] in LOCAL mode", async () => {
    const { svc, search } = makeService(EmbeddingProvider.LOCAL);
    expect(await svc.searchWorldbuilding("proj-1", "q")).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("does NOT short-circuit when a real provider is active (OPENAI still queries)", async () => {
    const { svc, search } = makeService(EmbeddingProvider.OPENAI);
    // Force generateEmbedding to a fixed vector so we reach the client.search call.
    (svc as unknown as AnyObj).generateEmbedding = jest.fn(async () => new Array(3072).fill(0));
    await svc.searchScenes("proj-1", "q").catch(() => { /* search() throws by design */ });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest QdrantFailClosed > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — the three LOCAL tests fail because `client.search` is called and throws "must not be called".

- [ ] **Step 3: Write minimal implementation**

In `src/services/QdrantMemoryService.ts`, add a private guard helper just above `searchCharacters` (around line 397):

```ts
  /**
   * Slice 0: vector search is meaningless in LOCAL mode (deterministic noise
   * vectors). Fail closed — callers get [] and fall back to structured state.
   * Warns once so the degraded mode is visible rather than silent.
   */
  private retrievalDisabled(): boolean {
    if (this.embeddingProvider === EmbeddingProvider.LOCAL) {
      if (!QdrantMemoryService.localSearchWarningEmitted) {
        QdrantMemoryService.localSearchWarningEmitted = true;
        console.warn(
          "[QdrantMemory] Embedding provider is LOCAL (noise vectors); vector retrieval is DISABLED. " +
          "Continuity is served from structured state only. Set OPENAI_API_KEY or GEMINI_API_KEY to enable retrieval."
        );
      }
      return true;
    }
    return false;
  }
```

Add the static flag next to the existing `localWarningEmitted` static (search for `localWarningEmitted` near the top of the class and add beside it):

```ts
  private static localSearchWarningEmitted = false;
```

Then add one guard line as the FIRST statement inside each of the three search methods, immediately after the opening `{` (before the existing `if (!this.client) return [];`):

In `searchCharacters` (~:402), `searchWorldbuilding` (~:601), `searchScenes` (~:700):
```ts
    if (this.retrievalDisabled()) return [];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest QdrantFailClosed > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/services/QdrantMemoryService.ts api-gateway/src/__tests__/QdrantFailClosed.test.ts
git commit -m "fix(memory): fail closed on LOCAL embeddings (Slice 0)

LOCAL produces deterministic noise vectors; vector search ranked over
them is meaningless. searchScenes/searchCharacters/searchWorldbuilding
now return [] without querying Qdrant in LOCAL mode, with a one-time
warning, so continuity falls back to structured state explicitly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add `advancedPlan` to `GenerationState` and persist it

**Why:** `runAdvancedPlanningPhase` (`StorytellerOrchestrator.ts:848-872`) computes the plan into a local `const` and only `saveArtifact`s it — `state.advancedPlan` does not exist, so the Writer can never see motifs/subtext/beats. Add the field and assign it.

**Files:**
- Modify: `src/models/AgentModels.ts` (add field after `worldState?` ~:342)
- Modify: `src/services/StorytellerOrchestrator.ts:867-868`
- Test: `src/__tests__/AdvancedPlanPersist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/AdvancedPlanPersist.test.ts`:

```ts
/**
 * Slice 1a: the Strategist's advanced plan must be written to run state
 * (state.advancedPlan), not just saved as a Supabase artifact, so the
 * Writer can read motifs/subtext/beats downstream.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

describe("runAdvancedPlanningPhase persists advancedPlan to state", () => {
  it("assigns the Strategist output to state.advancedPlan", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;

    const runId = "run-1";
    const state: AnyObj = {
      runId, projectId: "proj-1", outline: { scenes: [] }, updatedAt: "",
    };
    o.activeRuns = new Map([[runId, state]]);

    const planContent = { motifs: { water: "rebirth" }, subtext: { a: "b" } };
    o.agentFactory = { getAgent: () => ({ execute: async () => ({ content: planContent }) }) };
    o.publishPhaseStart = jest.fn(async () => {});
    o.publishPhaseComplete = jest.fn(async () => {});
    o.saveArtifact = jest.fn(async () => {});

    await (o.runAdvancedPlanningPhase as (r: string, opts: AnyObj) => Promise<void>)(
      runId, { projectId: "proj-1" }
    );

    expect(state.advancedPlan).toEqual(planContent);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest AdvancedPlanPersist > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — `state.advancedPlan` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/models/AgentModels.ts`, immediately after the `worldState?` field (ends ~:342), add:

```ts
  /**
   * Advanced planning output (motifs, subtext, emotional beats, sensory blueprints).
   * Produced by the Strategist in the ADVANCED_PLANNING phase and injected into
   * the Writer/Critic prompts. Persisted here so it survives past its phase.
   */
  @Optional()
  @Property()
  advancedPlan?: Record<string, unknown>;
```

In `src/services/StorytellerOrchestrator.ts`, in `runAdvancedPlanningPhase`, change lines 867-868 from:

```ts
    const advancedPlan = output.content as Record<string, unknown>;
    state.updatedAt = new Date().toISOString();
```
to:
```ts
    const advancedPlan = output.content as Record<string, unknown>;
    state.advancedPlan = advancedPlan;
    state.updatedAt = new Date().toISOString();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest AdvancedPlanPersist > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/models/AgentModels.ts api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/AdvancedPlanPersist.test.ts
git commit -m "fix(orchestrator): persist advancedPlan to run state (Slice 1a)

Strategist output was computed into a local const and only saved as an
artifact; add GenerationState.advancedPlan and assign it so the Writer
and Critic can read motifs/subtext/beats downstream.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Shared context-block helpers on `BaseAgent`

**Why:** Both Writer and Critic need to render `worldState` and the `advancedPlan` slice into prompt text. Put the renderers on the shared parent `BaseAgent` (where the agents already inherit `buildConstraintsBlock`-style helpers) to avoid a third duplication.

**Files:**
- Modify: `src/agents/BaseAgent.ts` (add two `protected` methods)
- Test: `src/__tests__/BaseAgentContextBlocks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/BaseAgentContextBlocks.test.ts`:

```ts
/**
 * Slice 1a: BaseAgent gains two render helpers so Writer and Critic can
 * inject the (already-computed) worldState and advancedPlan slice.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { BaseAgent } from "../agents/BaseAgent";

type AnyObj = Record<string, unknown>;

// Minimal concrete subclass to reach the protected helpers.
class ProbeAgent extends (BaseAgent as unknown as { new (...a: unknown[]): AnyObj }) {}

function probe(): AnyObj {
  return new (ProbeAgent as unknown as { new (): AnyObj })();
}

describe("BaseAgent.buildWorldStateBlock", () => {
  it("renders character status/location and key facts", () => {
    const p = probe();
    const ws = {
      runId: "r", lastUpdatedScene: 4, lastUpdatedAt: "",
      characters: [
        { name: "Mara", role: "lead", status: "dead", currentLocation: "crypt", attributes: {}, relationships: {}, lastSeenScene: 4 },
        { name: "Jon", role: "ally", status: "alive", currentLocation: "harbor", attributes: {}, relationships: {}, lastSeenScene: 3 },
      ],
      locations: [], organizations: [], timeline: [],
      keyFacts: ["The bridge collapsed in scene 2."],
    };
    const out = (p.buildWorldStateBlock as (w: unknown) => string)(ws);
    expect(out).toContain("Mara");
    expect(out).toContain("dead");
    expect(out).toContain("crypt");
    expect(out).toContain("bridge collapsed");
  });

  it("returns a safe placeholder when worldState is undefined", () => {
    const p = probe();
    const out = (p.buildWorldStateBlock as (w: unknown) => string)(undefined);
    expect(out).toMatch(/no world state/i);
  });
});

describe("BaseAgent.buildAdvancedPlanBlock", () => {
  it("renders motifs and subtext when present", () => {
    const p = probe();
    const plan = { motifs: { water: "rebirth" }, subtext: { Mara: "guilt" } };
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(plan, 3);
    expect(out).toContain("water");
    expect(out).toContain("rebirth");
    expect(out).toContain("guilt");
  });

  it("returns a safe placeholder when plan is undefined", () => {
    const p = probe();
    const out = (p.buildAdvancedPlanBlock as (pl: unknown, n: number) => string)(undefined, 1);
    expect(out).toMatch(/no advanced plan/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest BaseAgentContextBlocks > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — `buildWorldStateBlock is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/agents/BaseAgent.ts`, add these two `protected` methods inside the class (place them near the existing prompt-building helpers). Add the `WorldState` import if not present — at the top, extend the existing `../models/AgentModels` import to include `WorldState`:

```ts
import { WorldState } from "../models/AgentModels";
```
(If `AgentModels` is already imported, add `WorldState` to that import's brace list instead of a new line.)

```ts
  /**
   * Render the evolving world state into a compact, always-on continuity block.
   * Slice 1a: this is the highest-priority dynamic context — who is alive/dead,
   * where they are, and the hard facts established so far.
   */
  protected buildWorldStateBlock(worldState?: WorldState): string {
    if (!worldState) return "No world state tracked yet.";
    const lines: string[] = [];
    const chars = worldState.characters ?? [];
    if (chars.length > 0) {
      lines.push("Characters (current status):");
      for (const c of chars) {
        const loc = c.currentLocation ? `, at ${c.currentLocation}` : "";
        lines.push(`- ${c.name} [${c.status}${loc}] (last seen scene ${c.lastSeenScene})`);
      }
    }
    const facts = worldState.keyFacts ?? [];
    if (facts.length > 0) {
      lines.push("Established facts:");
      for (const f of facts) lines.push(`- ${f}`);
    }
    return lines.length > 0 ? lines.join("\n") : "No world state tracked yet.";
  }

  /**
   * Render the advanced-plan slice (motifs, subtext, emotional beat for this
   * scene) into a craft-guidance block. The plan's internal shape is a loose
   * record, so extraction is defensive: per-scene keys are used when present,
   * else the whole sub-object is summarized.
   */
  protected buildAdvancedPlanBlock(plan: Record<string, unknown> | undefined, sceneNum: number): string {
    if (!plan || Object.keys(plan).length === 0) return "No advanced plan available.";
    const pick = (obj: unknown): unknown => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const rec = obj as Record<string, unknown>;
        return rec[String(sceneNum)] ?? rec[`scene${sceneNum}`] ?? rec;
      }
      return obj;
    };
    const parts: string[] = [];
    if (plan.motifs) parts.push(`Motifs: ${JSON.stringify(plan.motifs)}`);
    if (plan.subtext) parts.push(`Subtext: ${JSON.stringify(plan.subtext)}`);
    if (plan.emotionalBeats) parts.push(`Emotional beat (this scene): ${JSON.stringify(pick(plan.emotionalBeats))}`);
    if (plan.sensory) parts.push(`Sensory blueprint: ${JSON.stringify(pick(plan.sensory))}`);
    return parts.length > 0 ? parts.join("\n") : "No advanced plan available.";
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest BaseAgentContextBlocks > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/agents/BaseAgent.ts api-gateway/src/__tests__/BaseAgentContextBlocks.test.ts
git commit -m "feat(agents): shared worldState + advancedPlan render helpers (Slice 1a)

BaseAgent.buildWorldStateBlock and buildAdvancedPlanBlock give Writer and
Critic a single, DRY way to inject the already-computed continuity state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Inject worldState + advancedPlan into the Writer DRAFTING prompt

**Why:** The standard draft prompt (`WriterAgent.ts:276-298`) injects only the scene outline JSON, constraints, and `retrievedContext`. The Writer never sees worldState (write-only today) or the advancedPlan (now persisted in Task 2). Inject both, high in the prompt per the assembly ladder.

**Files:**
- Modify: `src/agents/WriterAgent.ts` (standard DRAFTING return, :276-298)
- Test: `src/__tests__/WriterContextInjection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/WriterContextInjection.test.ts`:

```ts
/**
 * Slice 1a: the Writer's standard drafting prompt must contain the worldState
 * continuity block and the advancedPlan craft block.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { WriterAgent } from "../agents/WriterAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeWriter(): WriterAgent {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof WriterAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof WriterAgent>[0];
  return new WriterAgent(llmProvider, langfuse, undefined, undefined, { publishEvent: jest.fn(async () => "e") } as unknown as ConstructorParameters<typeof WriterAgent>[4]);
}

function draftContext(): AnyObj {
  return {
    runId: "r", projectId: "p",
    state: {
      currentScene: 3,
      outline: { scenes: [{}, {}, { title: "The Crypt", wordCount: 800 }] },
      currentSceneOutline: { title: "The Crypt", wordCount: 800, retrievedContext: "" },
      keyConstraints: [],
      characters: [{ name: "Mara", role: "lead" }],
      worldState: {
        runId: "r", lastUpdatedScene: 2, lastUpdatedAt: "",
        characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tower", attributes: {}, relationships: {}, lastSeenScene: 2 }],
        locations: [], organizations: [], timeline: [], keyFacts: ["The seal was broken in scene 2."],
      },
      advancedPlan: { motifs: { shadow: "doubt" } },
    },
  };
}

describe("WriterAgent DRAFTING prompt injects continuity + plan", () => {
  it("includes the worldState block (dead character, key fact)", () => {
    const w = makeWriter() as unknown as AnyObj;
    const prompt = (w.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      draftContext(), { projectId: "p" }, GenerationPhase.DRAFTING
    );
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("dead");
    expect(prompt).toContain("seal was broken");
  });

  it("includes the advancedPlan motifs block", () => {
    const w = makeWriter() as unknown as AnyObj;
    const prompt = (w.buildUserPrompt as (c: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      draftContext(), { projectId: "p" }, GenerationPhase.DRAFTING
    );
    expect(prompt).toContain("shadow");
    expect(prompt).toContain("doubt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest WriterContextInjection > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — the prompt does not contain "Vex"/"shadow".

- [ ] **Step 3: Write minimal implementation**

In `src/agents/WriterAgent.ts`, in the standard DRAFTING return (currently lines 276-298), build the two blocks just before the `return` and insert them high in the prompt. Replace the block starting at `// Include retrieved context from Qdrant for hallucination prevention` (line 273) through the end of that `return` (line 297) with:

```ts
      // Include retrieved context from Qdrant for hallucination prevention
      const retrievedContext = String(sceneOutline.retrievedContext ?? "");
      // Slice 1a: always-on continuity + craft guidance (highest priority).
      const worldStateBlock = this.buildWorldStateBlock(state.worldState);
      const advancedPlanBlock = this.buildAdvancedPlanBlock(state.advancedPlan, sceneNum);

      return `Write Scene ${sceneNum}: "${sceneTitle}"

WORLD STATE (authoritative continuity — do NOT contradict):
${worldStateBlock}

STORY CRAFT PLAN (weave these in):
${advancedPlanBlock}

Scene outline:
${JSON.stringify(sceneOutline, null, 2)}

SCOPE CONTROL (CRITICAL):
- Cover ONLY what's in this scene outline - do not advance the plot beyond what's specified
- FORBIDDEN: Depicting events, revelations, or conflicts from later scenes
- FORBIDDEN: Resolving tensions that should carry into future scenes
- End condition: The last paragraph MUST land on the specified hook - do not go past it

Requirements:
- Follow the emotional beat and conflict specified
- Maintain character voices and consistency
- Include sensory details and atmosphere
- End with the specified hook (not before, not after)
- Target word count: ${sceneOutline.wordCount ?? 1500} words

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}
${autonomousInstruction}`;
```

Note: `state` and `sceneNum` are already in scope in this branch (`sceneNum` at :162, `state` at :153). Do not change the `beatsMode`/`expansionMode` branches in this task.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest WriterContextInjection > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/agents/WriterAgent.ts api-gateway/src/__tests__/WriterContextInjection.test.ts
git commit -m "feat(writer): inject worldState + advancedPlan into drafting prompt (Slice 1a)

Closes two open loops: worldState (was write-only) and advancedPlan (now
persisted) are placed high in the Writer's standard drafting prompt so
prose respects current continuity and weaves planned motifs/subtext.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Inject roster + worldState into the Critic CRITIQUE prompt

**Why:** The Critic (`CriticAgent.ts:182-249`) is told to evaluate "character consistency" but never receives character profiles or worldState — so it cannot catch a dead character speaking or trait drift. Inject the roster and worldState block so the consistency axis is actually checkable.

**Files:**
- Modify: `src/agents/CriticAgent.ts` (CRITIQUE branch, :190-249)
- Test: `src/__tests__/CriticContextInjection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/CriticContextInjection.test.ts`:

```ts
/**
 * Slice 1a: the Critic's critique prompt must contain the character roster
 * and the worldState block so it can verify the consistency it is asked to
 * judge (e.g. a character marked dead must not act in the draft).
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    get isEnabled() { return false; }
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { CriticAgent } from "../agents/CriticAgent";
import { GenerationPhase } from "../models/LLMModels";

type AnyObj = Record<string, unknown>;

function makeCritic(): AnyObj {
  const langfuse = { isEnabled: false, startSpan: () => "s", endSpan: () => {}, addEvent: () => {}, trackLLMCall: () => {} } as unknown as ConstructorParameters<typeof CriticAgent>[1];
  const llmProvider = {} as unknown as ConstructorParameters<typeof CriticAgent>[0];
  return new CriticAgent(llmProvider, langfuse, undefined, undefined, { publishEvent: jest.fn(async () => "e") } as unknown as ConstructorParameters<typeof CriticAgent>[4]) as unknown as AnyObj;
}

function critiqueContext(): AnyObj {
  const drafts = new Map<number, AnyObj>();
  drafts.set(2, { content: "Vex laughed and drew his sword." });
  return {
    runId: "r", projectId: "p",
    state: {
      currentScene: 2,
      outline: { scenes: [{}, { title: "Duel", wordCount: 500, hook: "the blade falls" }] },
      drafts,
      keyConstraints: [],
      characters: [{ name: "Vex", role: "foe" }, { name: "Mara", role: "lead" }],
      worldState: {
        runId: "r", lastUpdatedScene: 1, lastUpdatedAt: "",
        characters: [{ name: "Vex", role: "foe", status: "dead", currentLocation: "tomb", attributes: {}, relationships: {}, lastSeenScene: 1 }],
        locations: [], organizations: [], timeline: [], keyFacts: [],
      },
    },
  };
}

describe("CriticAgent CRITIQUE prompt injects roster + worldState", () => {
  it("includes the character roster", () => {
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      critiqueContext(), { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    expect(prompt).toContain("Mara");
  });

  it("includes the worldState block so a dead-character contradiction is checkable", () => {
    const c = makeCritic();
    const prompt = (c.buildUserPrompt as (x: AnyObj, o: AnyObj, p: GenerationPhase) => string)(
      critiqueContext(), { projectId: "p" }, GenerationPhase.CRITIQUE
    );
    expect(prompt).toContain("Vex");
    expect(prompt).toContain("dead");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest CriticContextInjection > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — prompt lacks "dead"/roster.

- [ ] **Step 3: Write minimal implementation**

In `src/agents/CriticAgent.ts`, inside the `if (phase === GenerationPhase.CRITIQUE)` branch, build the blocks before the `return` (after `const sceneHook = ...` at :209) and insert them into the prompt. Add right after line 209:

```ts
      // Slice 1a: give the Critic the context it needs to judge consistency.
      const rosterBlock = (state.characters ?? [])
        .map((c) => {
          const rec = c as Record<string, unknown>;
          return `- ${String(rec.name ?? "?")}${rec.role ? ` (${String(rec.role)})` : ""}`;
        })
        .join("\n") || "No characters defined.";
      const worldStateBlock = this.buildWorldStateBlock(state.worldState);
```

Then, in the returned template string, insert these two sections immediately after the `SCENE OUTLINE (for scope checking):` block and before `WORD COUNT CHECK (CRITICAL):`. Concretely, change:

```ts
SCENE OUTLINE (for scope checking):
${JSON.stringify(sceneOutline, null, 2)}

WORD COUNT CHECK (CRITICAL):
```
to:
```ts
SCENE OUTLINE (for scope checking):
${JSON.stringify(sceneOutline, null, 2)}

CHARACTER ROSTER (for consistency checking):
${rosterBlock}

WORLD STATE (authoritative — flag any contradiction, e.g. a character marked dead who acts):
${worldStateBlock}

WORD COUNT CHECK (CRITICAL):
```

Also extend the `Evaluate:` list — change item `2. Character consistency` to:
```ts
2. Character consistency (against the ROSTER and WORLD STATE above — a dead/absent character must not act)
```

Do not alter the `Output JSON with:` section in this task (Task 6 adds the schema fields; the prompt already asks for `wordCountCompliance`/`scopeAdherence`).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest CriticContextInjection > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/agents/CriticAgent.ts api-gateway/src/__tests__/CriticContextInjection.test.ts
git commit -m "feat(critic): inject roster + worldState into critique prompt (Slice 1a)

The Critic was told to judge character consistency with no profiles or
world state. Inject both so contradictions (e.g. a dead character acting)
are now visible to the gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Restore the Critic's stripped hard-gate fields

**Why:** `isRevisionNeeded` (`CriticAgent.ts:89,94`) reads `critique.wordCountCompliance` and `critique.scopeAdherence`, but `CritiqueSchema` (`AgentSchemas.ts:159-166`) is a non-passthrough `z.object` that lacks both — `validateOutput` strips them, so the two "hard requirement" guards always see `undefined` and never fire. Add the fields.

**Files:**
- Modify: `src/schemas/AgentSchemas.ts:159-166`
- Test: `src/__tests__/CritiqueSchemaFields.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/CritiqueSchemaFields.test.ts`:

```ts
/**
 * Slice 1a: CritiqueSchema must preserve wordCountCompliance and
 * scopeAdherence — the Critic's isRevisionNeeded hard gates read them,
 * but the non-passthrough schema was stripping them to undefined.
 */
import { CritiqueSchema } from "../schemas/AgentSchemas";

describe("CritiqueSchema preserves hard-gate fields", () => {
  it("keeps wordCountCompliance and scopeAdherence after parse", () => {
    const parsed = CritiqueSchema.parse({
      approved: false, score: 6, revision_needed: true,
      wordCountCompliance: false, scopeAdherence: true,
      issues: ["too short"], revisionRequests: ["expand"],
    });
    expect(parsed.wordCountCompliance).toBe(false);
    expect(parsed.scopeAdherence).toBe(true);
  });

  it("still accepts a critique that omits them (both optional)", () => {
    const parsed = CritiqueSchema.parse({ score: 9 });
    expect(parsed.score).toBe(9);
    expect(parsed.wordCountCompliance).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest CritiqueSchemaFields > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — `parsed.wordCountCompliance` is `undefined` (stripped) in the first test.

- [ ] **Step 3: Write minimal implementation**

In `src/schemas/AgentSchemas.ts`, change `CritiqueSchema` (lines 159-166) to add the two fields:

```ts
export const CritiqueSchema = z.object({
  approved: z.boolean().optional(),
  score: z.number().min(1).max(10).optional(),
  revision_needed: z.boolean().optional(),
  wordCountCompliance: z.boolean().optional(),
  scopeAdherence: z.boolean().optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
  revisionRequests: z.array(z.string()).optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest CritiqueSchemaFields > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/schemas/AgentSchemas.ts api-gateway/src/__tests__/CritiqueSchemaFields.test.ts
git commit -m "fix(schema): preserve Critic wordCountCompliance/scopeAdherence (Slice 1a)

These two fields are read by isRevisionNeeded's hard gates but were being
stripped by the non-passthrough CritiqueSchema, so the gates always saw
undefined. Declare them so scope/word-count enforcement actually fires.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Unify the approval threshold

**Why:** `isApproved` (`StorytellerOrchestrator.ts:2328-2335`) approves at `score >= 8` and also auto-approves whenever `revision_needed === false` (a flag that can bypass the score gate), while the docs and `CriticAgent.isRevisionNeeded` use 7. Unify on a single `APPROVAL_THRESHOLD = 7` constant and require a qualifying score (or an explicit `approved` flag) for approval, while still letting an explicit `revision_needed === true` block.

**Files:**
- Modify: `src/services/StorytellerOrchestrator.ts:2328-2335`
- Test: `src/__tests__/ApprovalThreshold.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ApprovalThreshold.test.ts`:

```ts
/**
 * Slice 1a: isApproved unifies on a single threshold (7) and no longer lets
 * revision_needed===false auto-approve a scene that lacks a qualifying score.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;
function isApproved(critique: AnyObj): boolean {
  const o = new StorytellerOrchestrator() as unknown as AnyObj;
  return (o.isApproved as (c: AnyObj) => boolean)(critique);
}

describe("isApproved unified threshold (7)", () => {
  it("approves a score of 7 with no blocking flag", () => {
    expect(isApproved({ score: 7 })).toBe(true);
  });
  it("rejects a score of 6", () => {
    expect(isApproved({ score: 6 })).toBe(false);
  });
  it("rejects when revision_needed is true even with a high score", () => {
    expect(isApproved({ score: 9, revision_needed: true })).toBe(false);
  });
  it("does NOT auto-approve on revision_needed===false without a qualifying score", () => {
    expect(isApproved({ revision_needed: false })).toBe(false);
  });
  it("honors an explicit approved flag with a qualifying score", () => {
    expect(isApproved({ approved: true, score: 8 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest ApprovalThreshold > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — current code approves `{score:7}` as false (uses ≥8) and `{revision_needed:false}` as true.

- [ ] **Step 3: Write minimal implementation**

In `src/services/StorytellerOrchestrator.ts`, add a class-level constant near the top of the class body (next to the private fields, ~line 157):

```ts
  private static readonly APPROVAL_THRESHOLD = 7;
```

Replace `isApproved` (lines 2328-2335) with:

```ts
  private isApproved(critique: Record<string, unknown>): boolean {
    const score = typeof critique.score === "number" && !isNaN(critique.score)
      ? critique.score
      : null;
    // An explicit revision request always blocks approval.
    if (critique.revision_needed === true) return false;
    // Require a qualifying score (the unified bar) ...
    if (score !== null && score >= StorytellerOrchestrator.APPROVAL_THRESHOLD) return true;
    // ... or an explicit approval flag that isn't contradicted by a low score.
    if (critique.approved === true && (score === null || score >= StorytellerOrchestrator.APPROVAL_THRESHOLD)) return true;
    return false;
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest ApprovalThreshold > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 5 tests.

- [ ] **Step 5: Verify the existing ArchivistFlush suite still passes (it drives runDraftingLoop)**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest ArchivistFlush > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — its critic stub returns `{ revision_needed: false, score: 9 }`, which still approves (score ≥ 7).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/ApprovalThreshold.test.ts
git commit -m "fix(orchestrator): unify approval threshold to 7 (Slice 1a)

isApproved used >=8 while docs/Critic use 7, and auto-approved on
revision_needed===false regardless of score. Unify on a single
APPROVAL_THRESHOLD constant and require a qualifying score (or explicit
approved flag) so a self-reported flag can't bypass the gate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Re-critique the final revision (kill silent sub-threshold acceptance)

**Why:** The revision loop (`runDraftingLoop`, :938-960) exits after the last `reviseScene` without re-scoring. A scene that never reached approval is finalized via `emitSceneFinal(..., "not_approved")` (:984) with no recorded score — silently accepted and indistinguishable downstream. Add a score-only final critique that records the score and an explicit status; do not consume a revision slot.

**Files:**
- Modify: `src/services/StorytellerOrchestrator.ts` (runDraftingLoop, around :938-985)
- Test: `src/__tests__/FinalRecritique.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/FinalRecritique.test.ts` (modeled on `ArchivistFlush.test.ts`'s stub pattern):

```ts
/**
 * Slice 1a: when a scene exhausts revisions without approval, the loop must
 * run one final score-only critique and finalize with a "flagged_subthreshold"
 * status carrying the score — not silently accept it.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startTrace() {} endTrace() {} startSpan() { return "s"; } endSpan() {}
    addEvent() {} trackLLMCall() {} async getPrompt() { return { compile: () => "" }; }
    recordUserFeedback() {} recordRegenerationRequest() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";

type AnyObj = Record<string, unknown>;

function makeState(runId: string, sceneCount: number): AnyObj {
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({ wordCount: 200, title: `Scene ${i + 1}` }));
  return {
    runId, projectId: "proj-1", phase: "drafting", currentScene: 0, totalScenes: sceneCount,
    outline: { scenes }, characters: [], drafts: new Map(), critiques: new Map(),
    revisionCount: new Map(), messages: [], maxRevisions: 2, keyConstraints: [],
    rawFactsLog: [], lastArchivistScene: 0, isPaused: false, isCompleted: false,
    startedAt: "", updatedAt: "",
  };
}

describe("runDraftingLoop final re-critique", () => {
  it("runs a final critique and flags a never-approved scene with its score", async () => {
    const orch = new StorytellerOrchestrator();
    const o = orch as unknown as AnyObj;
    const runId = "run-1";
    const state = makeState(runId, 1);
    o.activeRuns = new Map([[runId, state]]);

    let critiqueCalls = 0;
    o.draftScene = jest.fn(async (_r: string, _o: AnyObj, n: number) => {
      (state.drafts as Map<number, AnyObj>).set(n, { wordCount: 500, content: "x" });
    });
    o.draftSceneWithBeats = jest.fn(async () => {});
    o.expandScene = jest.fn(async () => {});
    // Critic never approves (always low score).
    o.critiqueScene = jest.fn(async () => { critiqueCalls++; return { revision_needed: true, score: 5 }; });
    o.reviseScene = jest.fn(async () => {});
    o.polishScene = jest.fn(async () => {});
    o.runArchivistCheck = jest.fn(async () => {});
    o.publishEvent = jest.fn(async () => {});

    const finals: AnyObj[] = [];
    o.emitSceneFinal = jest.fn(async (_r: string, _p: string, n: number, status: string, score?: number) => {
      finals.push({ n, status, score });
    });

    await (o.runDraftingLoop as (r: string, opts: AnyObj) => Promise<void>)(runId, { projectId: "proj-1" });

    // 2 in-loop critiques (maxRevisions=2) + 1 final score-only critique = 3.
    expect(critiqueCalls).toBe(3);
    expect(finals).toHaveLength(1);
    expect(finals[0].status).toBe("flagged_subthreshold");
    expect(finals[0].score).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest FinalRecritique > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: FAIL — current code calls `critiqueScene` twice and emits `"not_approved"` with no score (3rd arg mismatch / status differs).

- [ ] **Step 3: Write minimal implementation**

In `src/services/StorytellerOrchestrator.ts`, in `runDraftingLoop`, replace the polish/finalize block (lines 968-985) with the version below. This adds a score-only final critique for the not-approved path and threads the score into `emitSceneFinal`:

```ts
      // Polish the scene ONLY if it was approved AND score < 8
      const shouldSkipPolish = typeof approvedCritiqueScore === "number" && approvedCritiqueScore >= 8;
      if (sceneApproved && !shouldSkipPolish) {
        await this.polishScene(runId, options, sceneNum + 1);
      } else if (sceneApproved && shouldSkipPolish) {
        console.log(`[Orchestrator] Scene ${sceneNum + 1} has high score (${approvedCritiqueScore}), skipping polish`);
        await this.emitSceneFinal(runId, options.projectId, sceneNum + 1, "skipped_high_score", approvedCritiqueScore);
      } else {
        // Not approved after max revisions: run ONE final score-only critique so
        // the accepted text carries a recorded score and an explicit flag, instead
        // of being silently accepted. This does not consume a revision slot.
        let finalScore: number | undefined;
        if (!this.shouldStop(runId)) {
          const finalCritique = await this.critiqueScene(runId, options, sceneNum + 1);
          const s = finalCritique.score;
          if (typeof s === "number" && !isNaN(s)) finalScore = s;
        }
        console.log(`[Orchestrator] Scene ${sceneNum + 1} not approved after ${revisionCount} revisions (final score ${finalScore ?? "n/a"})`);
        await this.emitSceneFinal(runId, options.projectId, sceneNum + 1, "flagged_subthreshold", finalScore);
      }
```

Update the `emitSceneFinal` signature to accept the optional score. Find its definition (~:1798) — it currently is `private async emitSceneFinal(runId, projectId, sceneNum, status)`. Add a trailing optional parameter and include it in the emitted payload:

```ts
  private async emitSceneFinal(
    runId: string,
    projectId: string,
    sceneNum: number,
    status: string,
    score?: number
  ): Promise<void> {
```
And in the event payload object it publishes, add `score` (alongside the existing `polishStatus`/status field):
```ts
      score,
```

Note: the `skipped_high_score` call now also passes `approvedCritiqueScore` — harmless and consistent. The string `"not_approved"` is replaced by `"flagged_subthreshold"`; if the frontend keys on `"not_approved"`, that is a separate UI concern out of scope here (the event still fires).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest FinalRecritique > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — 1 test.

- [ ] **Step 5: Re-run ArchivistFlush to confirm the approved path is unaffected**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest ArchivistFlush > /tmp/j.txt 2>&1; echo "exit=$?"; grep -E "Tests:|✕|√|FAIL|PASS" /tmp/j.txt; rm -f /tmp/j.txt
```
Expected: PASS — the approved-with-score-9 path skips polish via `"skipped_high_score"` (now with a score arg); its assertions only check archivist scenes, so they remain green.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/shalkin/manoe"
git add api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/FinalRecritique.test.ts
git commit -m "fix(orchestrator): re-critique final revision, flag sub-threshold (Slice 1a)

A scene that exhausted revisions was finalized with no recorded score and
a 'not_approved' status identical-looking to a pass. Run one score-only
final critique and finalize as 'flagged_subthreshold' carrying the score.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Full-suite regression + typecheck gate

**Why:** Confirm no cross-suite breakage and the build is clean before declaring Slice 0+1a done.

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" tsc --noEmit > /tmp/tc.txt 2>&1; echo "exit=$?"; tail -5 /tmp/tc.txt; rm -f /tmp/tc.txt
```
Expected: exit=0, no errors.

- [ ] **Step 2: Run the full suite (slow — allow up to ~8 min)**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" jest > /tmp/full.txt 2>&1; echo "exit=$?"; grep -E "Tests:|Test Suites:|✕|FAIL" /tmp/full.txt; rm -f /tmp/full.txt
```
Expected: all suites pass; the 8 new test files (QdrantFailClosed, AdvancedPlanPersist, BaseAgentContextBlocks, WriterContextInjection, CriticContextInjection, CritiqueSchemaFields, ApprovalThreshold, FinalRecritique) are green and prior suites remain green.

- [ ] **Step 3: Lint the touched files**

```bash
cd api-gateway
PATH="$PATH:./node_modules/.bin" eslint src/services/QdrantMemoryService.ts src/services/StorytellerOrchestrator.ts src/agents/BaseAgent.ts src/agents/WriterAgent.ts src/agents/CriticAgent.ts src/schemas/AgentSchemas.ts src/models/AgentModels.ts --ext .ts > /tmp/lint.txt 2>&1; echo "exit=$?"; cat /tmp/lint.txt; rm -f /tmp/lint.txt
```
Expected: exit=0 (no errors). Fix any introduced lint issues, then commit the fix.

- [ ] **Step 4: Final commit (if lint fixes were needed)**

```bash
cd "C:/Users/shalkin/manoe"
git add -A
git commit -m "chore: lint fixes for context-spine Slice 0+1a"
```

---

## Self-review notes (author)

- **Spec coverage:** Slice 0 (Task 1) ✓; Slice 1a item 1 advancedPlan persist (Task 2) ✓; items 2-3 Writer/Critic injection (Tasks 3-5) ✓; item 4 re-critique final revision (Task 8) ✓; item 5 threshold unify + schema fields (Tasks 6-7) ✓. `narratorVoice` injection intentionally deferred to Slice 2 (no state home today) — noted in scope. Prompt caching is Slice 1b (separate plan). Decomposed rubric *anchors* (§6.1) and cross-scene arc pass (§6.3) are Slice 2+ — this slice wires the *context* the rubric needs and fixes the *gate*; full rubric text is a prompt-engineering pass tracked separately.
- **Type consistency:** `buildWorldStateBlock(worldState?: WorldState)` and `buildAdvancedPlanBlock(plan, sceneNum)` are defined in Task 3 and called with those exact signatures in Tasks 4-5. `emitSceneFinal(..., status, score?)` extended in Task 8 and the `skipped_high_score` call site updated in the same task. `APPROVAL_THRESHOLD` defined and used only within `StorytellerOrchestrator`.
- **No placeholders:** every code step shows the full code; every run step shows the command and expected result.
