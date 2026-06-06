# Dialogue-Depth & Spice-Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two additive enhancements to the MANOE Writer path: (A) deepen dialogue via per-character voice exemplars, an anti-on-the-nose craft block, and a per-scene status shift; (B) an opt-in "spice" pass that amplifies intimate fragments through an uncensored OpenRouter model AFTER all quality gates run on clean text.

**Architecture:** Both features are additive and live around the Writer. Feature A enriches the existing single draft call (zero new LLM calls): a new `voiceExemplars` profile field (Profiler-seeded), a static craft block in the Writer system prompt, and a new `statusShift` carried on the per-scene `SceneContract` (filled by the Strategist's advanced plan, keyed by scene number). Feature B adds a `spiceConfig` (opt-in, default off): the smart model marks intimate fragments inline with `{{SPICE style="..."}}…{{/SPICE}}`; a fail-safe parser extracts those fragments to a side channel and detags the prose IMMEDIATELY after drafting, so every gate (guardrails, Critic, revision, polish) sees clean SOFT text; a terminal pass amplifies each fragment through OpenRouter and emits a spiced replacement, keeping SOFT as canon for Qdrant/Archivist.

**Coordinate-stability note (important):** The design spec §4.2 speaks of splicing amplified text "back at recorded coordinates." Numeric offsets are invalidated when revision/polish rewrite the scene. This plan therefore records each spice region as its **soft fragment text** and re-locates it in the FINAL scene by exact substring match at spice time. If a revision altered the fragment so it no longer matches, the spice pass skips that region and keeps the soft text (this is exactly the graceful degradation mandated by spec §4.5). For the common path (score ≥ 8 skips polish, no revision) the fragment survives verbatim and matches exactly.

**Tech Stack:** Ts.ED (TypeScript), Zod (`api-gateway/src/schemas/AgentSchemas.ts`), Jest + ts-jest (`api-gateway/src/__tests__/**/*.test.ts`), existing `LLMProviderService.createCompletionWithRetry`, Redis Streams SSE event bus.

**Commands (run from `api-gateway/`):**
- One suite: `npx jest <FileName>`
- One test: `npx jest -t "description"`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`

---

## File Structure

**Slice 1 — Feature A (dialogue depth):**
- Modify `api-gateway/src/schemas/AgentSchemas.ts` — add `voiceExemplars` to `CharacterSchema`; add `statusShifts` to `AdvancedPlanSchema`.
- Modify `api-gateway/src/agents/ProfilerAgent.ts` — ask for `voiceExemplars` in the CHARACTERS prompt.
- Modify `api-gateway/src/agents/BaseAgent.ts` — add `buildVoiceExemplarsBlock(...)`; render `statusShift` inside `buildSceneContractBlock`.
- Modify `api-gateway/src/agents/WriterAgent.ts` — inject the voice-exemplars block per scene (present characters only); add the craft block to the fallback system prompt.
- Modify `api-gateway/src/models/AgentModels.ts` — add `statusShift?: string` to `SceneContract`.
- Modify `api-gateway/src/services/StoryStateAssembler.ts` — read `statusShifts[sceneNum]` into the contract.
- Modify `api-gateway/src/agents/StrategistAgent.ts` — ask for `statusShifts` keyed by scene number in advanced planning.
- Tests: `BaseAgentVoiceExemplars.test.ts`, `StatusShiftWiring.test.ts` (new); extend `StoryStateAssembler.test.ts`.

**Slice 2 — Feature B (spice rewrite):**
- Modify `api-gateway/src/agents/types.ts` — add `SpiceConfig` interface + `spiceConfig?` on `GenerationOptions`.
- Modify `api-gateway/src/services/StorytellerOrchestrator.ts` — add `spiceConfig?` to its `GenerationOptions`; thread it; extract+detag after drafting; add the terminal spice pass; add `spiceRegions`/`spicedContent` to `SceneDraft`.
- Modify `api-gateway/src/controllers/OrchestrationController.ts` — accept `spiceConfig` (new + legacy snake_case) and forward it.
- Modify `api-gateway/src/models/AgentModels.ts` — add `SpiceRegion` interface + `spiceRegions` Map on `GenerationState`.
- Modify `api-gateway/src/agents/WriterAgent.ts` — append the tagging instruction in DRAFTING only when `options.spiceConfig` is present.
- Create `api-gateway/src/services/spiceParser.ts` — pure fail-safe extract/detag module.
- Create `api-gateway/src/services/SpiceRewriter.ts` — builds the amplify prompt and calls the OpenRouter model.
- Tests: `SpiceParser.test.ts`, `SpiceRewriter.test.ts`, `WriterSpiceTagging.test.ts` (new).

---

# SLICE 1 — Feature A: Dialogue Depth

Slice 1 delivers value with spice entirely off. Tasks 1–5.

---

### Task 1: Add `voiceExemplars` to the character schema and Profiler prompt

**Files:**
- Modify: `api-gateway/src/schemas/AgentSchemas.ts:68-91` (`CharacterSchema`)
- Modify: `api-gateway/src/agents/ProfilerAgent.ts:196-211` (CHARACTERS user prompt)
- Test: `api-gateway/src/__tests__/ProfilerAgentValidation.test.ts` (extend) — confirm `voiceExemplars` validates and is optional.

- [ ] **Step 1: Write the failing test**

Append to `api-gateway/src/__tests__/ProfilerAgentValidation.test.ts`:

```typescript
import { CharacterSchema } from "../schemas/AgentSchemas";

describe("CharacterSchema voiceExemplars", () => {
  it("accepts an array of exemplar lines", () => {
    const result = CharacterSchema.safeParse({
      name: "Mara",
      role: "protagonist",
      voiceExemplars: [
        "I don't run. I relocate.",
        "Ask me again and I'll forget you asked.",
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voiceExemplars).toHaveLength(2);
    }
  });

  it("is optional (absent is valid)", () => {
    const result = CharacterSchema.safeParse({ name: "Vex", role: "antagonist" });
    expect(result.success).toBe(true);
  });

  it("rejects non-string exemplar entries", () => {
    const result = CharacterSchema.safeParse({
      name: "Mara",
      role: "protagonist",
      voiceExemplars: [42],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest ProfilerAgentValidation -t "voiceExemplars"`
Expected: FAIL — the `rejects non-string` case passes only after the field is typed (currently `.passthrough()` lets `[42]` through silently, so that assertion fails).

- [ ] **Step 3: Add the field to `CharacterSchema`**

In `api-gateway/src/schemas/AgentSchemas.ts`, inside `CharacterSchema` (after the `voice` field, around line 84), add:

```typescript
  voice: z.string().optional(),
  // 3-5 characteristic spoken lines per character (rhythm, idiolect, what they
  // leave unsaid). Seeded by the Profiler, editable by the author, injected per
  // scene by the Writer for present characters only.
  voiceExemplars: z.array(z.string()).optional(),
```

- [ ] **Step 4: Ask the Profiler to produce exemplars**

In `api-gateway/src/agents/ProfilerAgent.ts`, in the CHARACTERS user prompt list (around line 205-208), add item 10:

```typescript
8. Voice and speech patterns
9. Relationships to other characters
10. voiceExemplars: an array of 3-5 SHORT characteristic lines this character would actually say (their rhythm, idiolect, what they deflect or leave unsaid). Distinct enough that a reader could tell two characters apart by line alone. NOT description of their voice - actual quoted lines.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest ProfilerAgentValidation -t "voiceExemplars"`
Expected: PASS (all three cases).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add api-gateway/src/schemas/AgentSchemas.ts api-gateway/src/agents/ProfilerAgent.ts api-gateway/src/__tests__/ProfilerAgentValidation.test.ts
git commit -m "feat(profiler): add per-character voiceExemplars field (Slice 1)"
```

---

### Task 2: Add `buildVoiceExemplarsBlock` to BaseAgent

This renders exemplars for the present characters only (token budget), with contrast emphasis (voices distinguish in opposition).

**Files:**
- Modify: `api-gateway/src/agents/BaseAgent.ts` (add a protected method after `buildSceneContractBlock`, ~line 277)
- Test: `api-gateway/src/__tests__/BaseAgentVoiceExemplars.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `api-gateway/src/__tests__/BaseAgentVoiceExemplars.test.ts`:

```typescript
/**
 * Slice 1: BaseAgent.buildVoiceExemplarsBlock renders exemplar lines for the
 * present characters only, so voices contrast within the scene.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { BaseAgent } from "../agents/BaseAgent";

type AnyObj = Record<string, unknown>;
class ProbeAgent extends (BaseAgent as unknown as { new (...a: unknown[]): AnyObj }) {}
function probe(): AnyObj {
  return new (ProbeAgent as unknown as { new (): AnyObj })();
}

describe("BaseAgent.buildVoiceExemplarsBlock", () => {
  const characters = [
    { name: "Mara", voiceExemplars: ["I don't run. I relocate."] },
    { name: "Vex", voiceExemplars: ["Everyone leaves a mark. You left a stain."] },
    { name: "Jon", voiceExemplars: ["Reckon we ought head home."] },
  ];

  it("renders exemplars only for present characters", () => {
    const p = probe();
    const out = (p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(
      characters, ["Mara", "Vex"]
    );
    expect(out).toContain("Mara");
    expect(out).toContain("I relocate");
    expect(out).toContain("Vex");
    expect(out).toContain("stain");
    expect(out).not.toContain("Jon");
    expect(out).not.toContain("head home");
  });

  it("placeholder when no present character has exemplars", () => {
    const p = probe();
    const out = (p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(
      [{ name: "Mara" }], ["Mara"]
    );
    expect(out).toMatch(/no voice exemplars/i);
  });

  it("placeholder when characters list is empty/undefined", () => {
    const p = probe();
    expect((p.buildVoiceExemplarsBlock as (c: unknown, present: string[]) => string)(undefined, ["Mara"]))
      .toMatch(/no voice exemplars/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest BaseAgentVoiceExemplars`
Expected: FAIL — `buildVoiceExemplarsBlock is not a function`.

- [ ] **Step 3: Implement the helper**

In `api-gateway/src/agents/BaseAgent.ts`, after `buildSceneContractBlock` (ends ~line 277), add:

```typescript
  /**
   * Render per-character voice exemplars for the characters present in this
   * scene only (token budget + contrast: voices distinguish in opposition).
   * Returns a safe placeholder when no present character has exemplars.
   */
  protected buildVoiceExemplarsBlock(characters: unknown, present: string[]): string {
    if (!Array.isArray(characters) || characters.length === 0) {
      return "No voice exemplars available — give each character a distinct rhythm and idiolect.";
    }
    const presentSet = new Set(present.map((n) => n.trim().toLowerCase()));
    const blocks: string[] = [];
    for (const char of characters) {
      if (typeof char !== "object" || char === null) continue;
      const rec = char as Record<string, unknown>;
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!name || (presentSet.size > 0 && !presentSet.has(name.toLowerCase()))) continue;
      const exemplars = Array.isArray(rec.voiceExemplars)
        ? rec.voiceExemplars.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        : [];
      if (exemplars.length === 0) continue;
      blocks.push(`${name}:\n${exemplars.map((e) => `  "${e}"`).join("\n")}`);
    }
    if (blocks.length === 0) {
      return "No voice exemplars available — give each character a distinct rhythm and idiolect.";
    }
    return `These are the characters' baseline voices (drift is allowed as the arc demands). Make them sound DIFFERENT from each other:\n${blocks.join("\n")}`;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest BaseAgentVoiceExemplars`
Expected: PASS (all three cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api-gateway/src/agents/BaseAgent.ts api-gateway/src/__tests__/BaseAgentVoiceExemplars.test.ts
git commit -m "feat(agents): add buildVoiceExemplarsBlock for per-scene voice injection (Slice 1)"
```

---

### Task 3: Inject the voice-exemplars block into the Writer DRAFTING prompt

Injected for both the standard and the beats first-part drafting paths (the two paths that start a scene fresh). Continuation/expansion parts inherit voice via the preceding text, so they are left unchanged.

**Files:**
- Modify: `api-gateway/src/agents/WriterAgent.ts:170-174` (compute the block) and the two scene-opening returns (`:194` beats first-part, `:305` standard)
- Test: `api-gateway/src/__tests__/WriterContextInjection.test.ts` (extend — follow its existing pattern)

- [ ] **Step 1: Read the existing Writer injection test to match its harness**

Run: `npx jest WriterContextInjection` and open `api-gateway/src/__tests__/WriterContextInjection.test.ts` to see how it constructs a `WriterAgent`, sets `state.characters` / `state.currentSceneContract`, and asserts on `buildUserPrompt` output. Reuse that exact setup in the next step.

- [ ] **Step 2: Write the failing test**

Append a block to `api-gateway/src/__tests__/WriterContextInjection.test.ts` (adapt the variable names to the file's existing helper that returns the DRAFTING user prompt — referenced below as `buildDraftingPrompt(state)`):

```typescript
describe("WriterAgent voice exemplars injection (DRAFTING)", () => {
  it("injects exemplars for present characters into the standard draft prompt", () => {
    const state = makeDraftingState(); // existing helper in this file
    state.characters = [
      { name: "Mara", role: "protagonist", voiceExemplars: ["I don't run. I relocate."] },
      { name: "Off-stage", role: "supporting", voiceExemplars: ["Never appears."] },
    ];
    state.currentSceneContract = {
      sceneNumber: 1, goal: "g", conflict: "c", hook: "h",
      charactersPresent: ["Mara"], targetWords: 1500, activeMotifs: [],
      valueShiftEntering: 0, valueShiftExitingTarget: 3,
    };
    const prompt = buildDraftingPrompt(state); // existing helper in this file
    expect(prompt).toContain("I don't run. I relocate.");
    expect(prompt).not.toContain("Never appears.");
  });
});
```

> If `WriterContextInjection.test.ts` does not already expose `makeDraftingState`/`buildDraftingPrompt` helpers, create local equivalents at the top of this `describe` using the same construction the file already uses for its other DRAFTING assertions (build a `WriterAgent`, cast to access the private `buildUserPrompt`, call it with `GenerationPhase.DRAFTING`). Do not invent new public surface on `WriterAgent`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest WriterContextInjection -t "voice exemplars"`
Expected: FAIL — the exemplar line is not present in the prompt.

- [ ] **Step 4: Compute the block once, alongside the other scene blocks**

In `api-gateway/src/agents/WriterAgent.ts`, in the DRAFTING branch where the other blocks are built (after line 174, `const sceneContractBlock = ...`), add:

```typescript
      const sceneContractBlock = this.buildSceneContractBlock(state.currentSceneContract);
      const presentCharacters = state.currentSceneContract?.charactersPresent ?? [];
      const voiceExemplarsBlock = this.buildVoiceExemplarsBlock(state.characters, presentCharacters);
```

- [ ] **Step 5: Render the block in the beats first-part return**

In the `isFirstPart` return (starts ~line 194), add a `CHARACTER VOICES` section after the `NARRATOR VOICE` block:

```typescript
NARRATOR VOICE (write in this voice consistently):
${narratorVoiceBlock}

CHARACTER VOICES (keep them distinct):
${voiceExemplarsBlock}

STORY SO FAR (prior scenes — for continuity, do not re-narrate):
${synopsisBlock}
```

- [ ] **Step 6: Render the block in the standard draft return**

In the standard return (starts ~line 305 `Write Scene ${sceneNum}...`), add the same section after the `NARRATOR VOICE` block:

```typescript
NARRATOR VOICE (write in this voice consistently):
${narratorVoiceBlock}

CHARACTER VOICES (keep them distinct):
${voiceExemplarsBlock}

STORY SO FAR (prior scenes — for continuity, do not re-narrate):
${synopsisBlock}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest WriterContextInjection -t "voice exemplars"`
Expected: PASS.

- [ ] **Step 8: Run the full Writer suites + typecheck (no regressions)**

Run: `npx jest WriterContextInjection WriterBeatsInjection && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add api-gateway/src/agents/WriterAgent.ts api-gateway/src/__tests__/WriterContextInjection.test.ts
git commit -m "feat(writer): inject per-character voice exemplars into draft prompt (Slice 1)"
```

---

### Task 4: Add the anti-on-the-nose craft block to the Writer system prompt

Per spec §3.2, the craft rules go in the system prompt (the user prompt is already large). This modifies `WriterAgent.getFallbackPrompt` so the rules ride every drafting/revision/polish call even without Langfuse.

**Files:**
- Modify: `api-gateway/src/agents/WriterAgent.ts:123-131` (`getFallbackPrompt`)
- Test: `api-gateway/src/__tests__/WriterContextInjection.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `api-gateway/src/__tests__/WriterContextInjection.test.ts`:

```typescript
describe("WriterAgent craft block (system prompt)", () => {
  it("the fallback system prompt carries anti-on-the-nose craft guidance", () => {
    const writer = makeWriter(); // existing helper; else: new WriterAgent(llm, langfuse)
    const sys = (writer as unknown as { getFallbackPrompt(v: Record<string, string>): string })
      .getFallbackPrompt({ keyConstraints: "none" });
    expect(sys.toLowerCase()).toContain("subtext");
    expect(sys.toLowerCase()).toContain("on-the-nose");
  });
});
```

> Use the same `WriterAgent` construction the file already uses. `getFallbackPrompt` is private; the cast above reaches it for the test only.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest WriterContextInjection -t "craft block"`
Expected: FAIL — neither "subtext" nor "on-the-nose" is present.

- [ ] **Step 3: Add the craft block to the fallback system prompt**

In `api-gateway/src/agents/WriterAgent.ts`, replace the body of `getFallbackPrompt` (lines 123-131) with:

```typescript
  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Writer, a skilled prose craftsman in an autonomous story generation pipeline.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.

DIALOGUE CRAFT (apply to every line of dialogue):
- Subtext over statement: characters pursue hidden goals obliquely. They talk between the lines. What matters most is usually what they refuse to say.
- Banned: on-the-nose dialogue. Do NOT have characters name their own emotions ("I'm so angry", "I feel betrayed") or explain their motivations aloud. Show the feeling through action, evasion, what they change the subject to, and silence.
- Banned: the "chatbot having feelings" voice — over-explained, over-polite, conflict-free exchanges where everyone understands everyone.
- Carry subtext through action and physical business (objects, gestures, pauses), not only through clever lines.
- Status moves: in a charged scene, power between characters should shift across the exchange — who controls it at the start should not trivially control it at the end.

CRITICAL INSTRUCTION: You are an autonomous agent in a simulation. DO NOT ask the user for feedback. DO NOT offer options (A/B/C). Always execute the best option immediately. Never output meta-commentary like "Here is the revised scene" or "Which approach would you prefer". Just output the story content directly.

Key Constraints: ${variables.keyConstraints || "No constraints established yet."}`;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest WriterContextInjection -t "craft block"`
Expected: PASS.

- [ ] **Step 5: Run the persona-break detector test (regression — the new block must not trip it)**

Run: `npx jest WriterAgent`
Expected: PASS — the existing `detectPersonaBreak` tests still pass (the craft block contains no A/B/C or question patterns).

- [ ] **Step 6: Commit**

```bash
git add api-gateway/src/agents/WriterAgent.ts api-gateway/src/__tests__/WriterContextInjection.test.ts
git commit -m "feat(writer): add anti-on-the-nose dialogue craft block to system prompt (Slice 1)"
```

---

### Task 5: Add per-scene `statusShift` (Strategist → advancedPlan → SceneContract → Writer)

Status (Johnstone power axis) is distinct from `valueShift` (McKee emotional valence). It is produced by the Strategist in advanced planning, keyed by scene number, and surfaced on the contract.

**Files:**
- Modify: `api-gateway/src/models/AgentModels.ts:306-316` (`SceneContract` interface)
- Modify: `api-gateway/src/schemas/AgentSchemas.ts:148-156` (`AdvancedPlanSchema`)
- Modify: `api-gateway/src/agents/StrategistAgent.ts:192-217` (advanced-planning prompt)
- Modify: `api-gateway/src/services/StoryStateAssembler.ts:44-70` (`assembleSceneContract`)
- Modify: `api-gateway/src/agents/BaseAgent.ts:266-277` (`buildSceneContractBlock`)
- Test: `api-gateway/src/__tests__/StoryStateAssembler.test.ts` (extend); `api-gateway/src/__tests__/StatusShiftWiring.test.ts` (new)

- [ ] **Step 1: Write the failing assembler test**

Append to `api-gateway/src/__tests__/StoryStateAssembler.test.ts` inside the existing `describe("assembleSceneContract", ...)` (the `state` const there has no `statusShifts` — add one in a fresh test):

```typescript
  it("reads the per-scene statusShift from advancedPlan.statusShifts", () => {
    const s = {
      outline: { scenes: [{ title: "A", goal: "g1", characters: ["Mara"] }] },
      advancedPlan: { statusShifts: { "1": "Mara enters low, ends dominant" } },
      valueShifts: new Map<number, number>(),
    } as unknown as AnyObj;
    const c = assembleSceneContract(s as never, 1);
    expect(c.statusShift).toBe("Mara enters low, ends dominant");
  });

  it("leaves statusShift undefined when not planned", () => {
    const c = assembleSceneContract(state as never, 1);
    expect(c.statusShift).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest StoryStateAssembler -t "statusShift"`
Expected: FAIL — `statusShift` is `undefined`/not on the type.

- [ ] **Step 3: Add the field to the `SceneContract` interface**

In `api-gateway/src/models/AgentModels.ts`, inside `SceneContract` (after `valueShiftExitingTarget`, line 315):

```typescript
  valueShiftEntering: number;       // == previous scene's achieved exit (0 for scene 1)
  valueShiftExitingTarget: number;  // intended charge at scene end
  /**
   * Per-scene status (power) trajectory — Johnstone's status play, distinct from
   * the McKee value-shift above. How power between present characters moves
   * across the scene. Filled by the Strategist's advanced plan; optional.
   */
  statusShift?: string;
```

- [ ] **Step 4: Add `statusShifts` to `AdvancedPlanSchema`**

In `api-gateway/src/schemas/AgentSchemas.ts`, inside `AdvancedPlanSchema` (after `sensory`, line 152):

```typescript
  emotionalBeats: z.record(z.unknown()).optional(),
  sensory: z.record(z.unknown()).optional(),
  // Per-scene status (power) trajectory, keyed by scene number (string). Johnstone
  // status play — distinct from emotional value-shift. Read per scene by the assembler.
  statusShifts: z.record(z.unknown()).optional(),
  contradictions: z.record(z.unknown()).optional(),
```

- [ ] **Step 5: Read `statusShifts[sceneNum]` in the assembler**

In `api-gateway/src/services/StoryStateAssembler.ts`, inside `assembleSceneContract`, before the `return` (after line 57), add:

```typescript
  const statusShiftsObj = (plan.statusShifts && typeof plan.statusShifts === "object" && !Array.isArray(plan.statusShifts))
    ? (plan.statusShifts as AnyObj)
    : {};
  const rawStatus = statusShiftsObj[String(sceneNum)] ?? statusShiftsObj[`scene${sceneNum}`];
  const statusShift = typeof rawStatus === "string" && rawStatus.trim() ? rawStatus : undefined;
```

Then add `statusShift` to the returned object (after `valueShiftExitingTarget`, line 68):

```typescript
    valueShiftEntering: entering,
    valueShiftExitingTarget: entering + 3, // default intent: move the charge meaningfully
    statusShift,
```

- [ ] **Step 6: Run the assembler test to verify it passes**

Run: `npx jest StoryStateAssembler -t "statusShift"`
Expected: PASS.

- [ ] **Step 7: Write the failing render test**

Create `api-gateway/src/__tests__/StatusShiftWiring.test.ts`:

```typescript
/**
 * Slice 1: statusShift renders in the scene-contract block when present, and is
 * silently omitted when absent (Johnstone power axis, distinct from value-shift).
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
  },
  AGENT_PROMPTS: {}, PHASE_PROMPTS: {},
}));

import { BaseAgent } from "../agents/BaseAgent";

type AnyObj = Record<string, unknown>;
class ProbeAgent extends (BaseAgent as unknown as { new (...a: unknown[]): AnyObj }) {}
function probe(): AnyObj {
  return new (ProbeAgent as unknown as { new (): AnyObj })();
}

const base = {
  sceneNumber: 1, goal: "g", conflict: "c", hook: "h",
  charactersPresent: ["Mara"], targetWords: 1500, activeMotifs: [],
  valueShiftEntering: 0, valueShiftExitingTarget: 3,
};

describe("buildSceneContractBlock statusShift", () => {
  it("renders the status trajectory when present", () => {
    const p = probe();
    const out = (p.buildSceneContractBlock as (c: unknown) => string)(
      { ...base, statusShift: "Mara enters low, ends dominant" }
    );
    expect(out).toContain("Mara enters low, ends dominant");
  });

  it("omits the status line when absent", () => {
    const p = probe();
    const out = (p.buildSceneContractBlock as (c: unknown) => string)(base);
    expect(out.toLowerCase()).not.toContain("status");
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npx jest StatusShiftWiring`
Expected: FAIL — the status trajectory line is not rendered.

- [ ] **Step 9: Render `statusShift` in `buildSceneContractBlock`**

In `api-gateway/src/agents/BaseAgent.ts`, inside `buildSceneContractBlock` (lines 266-277), append a conditional line before `return lines.join("\n")`:

```typescript
      `Emotional charge: enter at ${contract.valueShiftEntering}, end near ${contract.valueShiftExitingTarget} (the scene must shift the charge, not hold it flat).`,
    ];
    if (contract.statusShift && contract.statusShift.trim()) {
      lines.push(`Status (power) shift: ${contract.statusShift} (who holds power should move across the scene).`);
    }
    return lines.join("\n");
```

- [ ] **Step 10: Ask the Strategist for `statusShifts` in advanced planning**

In `api-gateway/src/agents/StrategistAgent.ts`, in the ADVANCED_PLANNING prompt (around line 199-217), add category 8 to the list and to the example:

In the categories list (after item 7 `complexity`):
```typescript
7. complexity - narrative-richness checklist (global)
8. statusShifts - the PER-SCENE power trajectory between characters (Johnstone status play), keyed by scene number. Describe who holds power at the start and how it moves by the end. Distinct from emotional beat.
```

In the example JSON (after the `"complexity"` line):
```typescript
  "complexity": { "check": "every scene turns on a value shift" },
  "statusShifts": { "1": "Mara enters supplicant, leaves holding the leverage", "2": "Vex dominant throughout, cracks at the end" }
```

- [ ] **Step 11: Run the render test + assembler test to verify they pass**

Run: `npx jest StatusShiftWiring StoryStateAssembler`
Expected: PASS.

- [ ] **Step 12: Typecheck the whole slice**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add api-gateway/src/models/AgentModels.ts api-gateway/src/schemas/AgentSchemas.ts api-gateway/src/agents/StrategistAgent.ts api-gateway/src/services/StoryStateAssembler.ts api-gateway/src/agents/BaseAgent.ts api-gateway/src/__tests__/StoryStateAssembler.test.ts api-gateway/src/__tests__/StatusShiftWiring.test.ts
git commit -m "feat(strategist): add per-scene statusShift to SceneContract (Slice 1)"
```

---

# SLICE 2 — Feature B: Spice Rewrite (opt-in, terminal)

Slice 2 is gated entirely behind `spiceConfig`. With no config the parser strips any stray tags and nothing leaks. Tasks 6–11.

---

### Task 6: Define `SpiceConfig` and thread it through options (no behavior yet)

**Files:**
- Modify: `api-gateway/src/agents/types.ts:46-52` (`GenerationOptions`)
- Modify: `api-gateway/src/services/StorytellerOrchestrator.ts:98-106` (orchestrator `GenerationOptions`)
- Modify: `api-gateway/src/controllers/OrchestrationController.ts` (DTO + mapping)
- Test: `api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts`:

```typescript
/**
 * Slice 2: SpiceConfig is an opt-in side config (default off). This pins its
 * shape and that GenerationOptions accepts it as optional.
 */
import type { GenerationOptions, SpiceConfig } from "../agents/types";

describe("SpiceConfig type", () => {
  it("accepts a fully-specified spice config on GenerationOptions", () => {
    const spice: SpiceConfig = {
      provider: "openrouter",
      model: "some/uncensored-model",
      apiKey: "sk-test",
      ceiling: "explicit, consensual",
    };
    const opts: GenerationOptions = {
      projectId: "p", seedIdea: "s",
      llmConfig: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "k" },
      mode: "full",
      spiceConfig: spice,
    };
    expect(opts.spiceConfig?.provider).toBe("openrouter");
  });

  it("is optional (absent is valid)", () => {
    const opts: GenerationOptions = {
      projectId: "p", seedIdea: "s",
      llmConfig: { provider: "anthropic", model: "claude-opus-4-5", apiKey: "k" },
      mode: "full",
    };
    expect(opts.spiceConfig).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SpiceConfigPlumbing`
Expected: FAIL — `SpiceConfig` is not exported from `../agents/types`.

- [ ] **Step 3: Add `SpiceConfig` to `agents/types.ts`**

In `api-gateway/src/agents/types.ts`, after `LLMConfiguration` (line 17), add:

```typescript
/**
 * Opt-in spice configuration (Slice 2). When absent, the spice feature is inert:
 * the Writer is not told to tag, and any stray {{SPICE}} markup is stripped.
 * Routes the terminal amplify pass to an uncensored OpenRouter model.
 */
export interface SpiceConfig {
  provider: string;   // typically "openrouter"
  model: string;
  apiKey: string;
  ceiling?: string;   // base intensity ceiling (e.g. "explicit, consensual")
}
```

Then add `spiceConfig?` to `GenerationOptions` (after `settings`, line 51):

```typescript
  settings?: Record<string, unknown>;
  spiceConfig?: SpiceConfig;
```

- [ ] **Step 4: Add `spiceConfig?` to the orchestrator's `GenerationOptions`**

In `api-gateway/src/services/StorytellerOrchestrator.ts`, import the type (extend the existing `../agents/types` import at line 40):

```typescript
import { AgentContext, SpiceConfig } from "../agents/types";
```

Then add to its `GenerationOptions` interface (after `embeddingApiKey`, line 105):

```typescript
  /** Embedding API key for WorldBibleEmbeddingService (Gemini API key) */
  embeddingApiKey?: string;
  /** Opt-in spice rewrite config (Slice 2). Absent = feature off. */
  spiceConfig?: SpiceConfig;
```

- [ ] **Step 5: Accept and forward `spiceConfig` in the controller**

In `api-gateway/src/controllers/OrchestrationController.ts`, add a DTO class after `LLMConfigDTO` (line 63):

```typescript
class SpiceConfigDTO {
  @Required()
  @Enum(LLMProvider)
  @Description("Provider for the spice rewrite (typically openrouter)")
  provider: LLMProvider;

  @Required()
  @Description("Uncensored model name on the provider")
  model: string;

  @Required()
  @Groups("internal")
  @Description("API key for the spice provider (BYOK)")
  apiKey: string;

  @Property()
  @Description("Base intensity ceiling for amplification")
  ceiling?: string;
}
```

Add the field to `GenerateRequestDTO` (after `settings`, line 93):

```typescript
  @Property()
  @Groups("internal")
  @Description("Opt-in spice rewrite config (default off)")
  spiceConfig?: SpiceConfigDTO;
```

Map it into `options` in `startGeneration` (after `embeddingApiKey,` line 311):

```typescript
      embeddingApiKey,
      spiceConfig: request.spiceConfig,
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npx jest SpiceConfigPlumbing && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add api-gateway/src/agents/types.ts api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/controllers/OrchestrationController.ts api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts
git commit -m "feat(spice): add SpiceConfig type and thread through options (Slice 2)"
```

---

### Task 7: Fail-safe spice parser (pure module)

Per spec §4.4: handle 0/1/N fragments, unclosed tags, nested tags, tags in a non-intimate scene, no tags, and literal `{{SPICE}}` markup that must never reach the reader. Never render markup, never throw.

**Files:**
- Create: `api-gateway/src/services/spiceParser.ts`
- Test: `api-gateway/src/__tests__/SpiceParser.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `api-gateway/src/__tests__/SpiceParser.test.ts`:

```typescript
/**
 * Slice 2: the spice parser extracts {{SPICE style="..."}}…{{/SPICE}} fragments
 * and returns clean SOFT prose. It must never throw and never leak markup.
 */
import { extractSpiceRegions } from "../services/spiceParser";

describe("extractSpiceRegions", () => {
  it("extracts a single well-formed region and detags the prose", () => {
    const raw = `She closed the door. {{SPICE style="slow burn"}}They moved closer.{{/SPICE}} Morning came.`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(regions).toHaveLength(1);
    expect(regions[0].text).toBe("They moved closer.");
    expect(regions[0].style).toBe("slow burn");
    expect(soft).toBe("She closed the door. They moved closer. Morning came.");
    expect(soft).not.toContain("{{");
  });

  it("extracts multiple regions in order", () => {
    const raw = `{{SPICE style="a"}}one{{/SPICE}} mid {{SPICE style="b"}}two{{/SPICE}}`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(regions.map((r) => r.text)).toEqual(["one", "two"]);
    expect(regions.map((r) => r.style)).toEqual(["a", "b"]);
    expect(soft).toBe("one mid two");
  });

  it("returns zero regions and unchanged prose when there are no tags", () => {
    const { soft, regions } = extractSpiceRegions("Just plain prose.");
    expect(regions).toHaveLength(0);
    expect(soft).toBe("Just plain prose.");
  });

  it("strips an unclosed opening tag without leaking markup (keeps the text)", () => {
    const raw = `Before {{SPICE style="x"}}the rest of the scene with no close`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(soft).not.toContain("{{");
    expect(soft).not.toContain("SPICE");
    expect(soft).toContain("the rest of the scene");
    expect(regions).toHaveLength(0); // unclosed => not a usable region
  });

  it("strips an orphan closing tag", () => {
    const { soft } = extractSpiceRegions("text {{/SPICE}} more");
    expect(soft).not.toContain("{{");
    expect(soft).toContain("text");
    expect(soft).toContain("more");
  });

  it("handles a style-less opening tag (style defaults to empty string)", () => {
    const { regions } = extractSpiceRegions(`{{SPICE}}body{{/SPICE}}`);
    expect(regions).toHaveLength(1);
    expect(regions[0].text).toBe("body");
    expect(regions[0].style).toBe("");
  });

  it("never throws on garbage input", () => {
    expect(() => extractSpiceRegions(`{{SPICE {{ }} /SPICE}} {{SPICE style=}}`)).not.toThrow();
    const { soft } = extractSpiceRegions(`{{SPICE {{ }} /SPICE}} {{SPICE style=}}`);
    expect(soft).not.toContain("{{SPICE");
  });

  it("flattens nested SPICE by taking the outermost region's inner text", () => {
    const raw = `{{SPICE style="outer"}}a {{SPICE style="inner"}}b{{/SPICE}} c{{/SPICE}}`;
    const { soft, regions } = extractSpiceRegions(raw);
    expect(soft).not.toContain("{{");
    // At least one usable region; inner markup must not survive in soft text.
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SpiceParser`
Expected: FAIL — module `../services/spiceParser` does not exist.

- [ ] **Step 3: Implement the parser**

Create `api-gateway/src/services/spiceParser.ts`:

```typescript
/**
 * Spice tag parser (Slice 2).
 *
 * The smart model marks intimate fragments inline:
 *   {{SPICE style="..."}} ...fragment... {{/SPICE}}
 *
 * This module extracts those fragments to a side channel and returns the clean
 * SOFT prose with all spice markup removed. It is the contract boundary with a
 * stochastic model, so it is TOTAL: it never throws and never lets {{SPICE...}}
 * or {{/SPICE}} markup survive into the returned text.
 */

export interface SpiceRegion {
  /** The soft fragment text the model wrapped (used to re-locate at spice time). */
  text: string;
  /** Per-fragment style label from the tag (may be empty). */
  style: string;
}

const OPEN_RE = /\{\{\s*SPICE\b([^}]*)\}\}/i;
const CLOSE_RE = /\{\{\s*\/\s*SPICE\s*\}\}/i;
const ANY_MARKUP_RE = /\{\{\s*\/?\s*SPICE\b[^}]*\}\}/gi;

function parseStyle(attrs: string): string {
  const m = attrs.match(/style\s*=\s*"([^"]*)"/i);
  return m ? m[1].trim() : "";
}

/**
 * Extract well-formed (open…close) regions and return detagged soft prose.
 * Malformed or unclosed markup is stripped from the soft text and produces no
 * region. Nested opens are flattened (the outer region wins; inner markup is
 * scrubbed from both the region text and the soft text).
 */
export function extractSpiceRegions(raw: string): { soft: string; regions: SpiceRegion[] } {
  if (typeof raw !== "string" || raw.length === 0) {
    return { soft: typeof raw === "string" ? raw : "", regions: [] };
  }

  const regions: SpiceRegion[] = [];
  let soft = "";
  let rest = raw;

  // Greedy linear scan: find the next open, then its matching close.
  // Guard the loop with a hard iteration cap so malformed input can never spin.
  let guard = 0;
  while (guard++ < 10000) {
    const open = rest.match(OPEN_RE);
    if (!open || open.index === undefined) break;

    // Text before the open tag is clean soft prose.
    soft += rest.slice(0, open.index);
    const afterOpen = rest.slice(open.index + open[0].length);

    const close = afterOpen.match(CLOSE_RE);
    if (!close || close.index === undefined) {
      // Unclosed open: drop the open tag, keep the trailing text as soft, stop.
      rest = afterOpen;
      break;
    }

    // Inner fragment text, with any nested SPICE markup scrubbed.
    const innerRaw = afterOpen.slice(0, close.index);
    const inner = innerRaw.replace(ANY_MARKUP_RE, "").trim();
    if (inner.length > 0) {
      regions.push({ text: inner, style: parseStyle(open[1]) });
      soft += inner;
    }
    rest = afterOpen.slice(close.index + close[0].length);
  }

  soft += rest;
  // Final safety net: scrub any markup that survived (orphan closes, garbage).
  soft = soft.replace(ANY_MARKUP_RE, "");
  return { soft, regions };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest SpiceParser`
Expected: PASS (all cases, including never-throws and no-leak).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api-gateway/src/services/spiceParser.ts api-gateway/src/__tests__/SpiceParser.test.ts
git commit -m "feat(spice): fail-safe spice tag parser (Slice 2)"
```

---

### Task 8: Add `SpiceRegion` storage to state and draft

Regions are extracted once (immediately post-draft) and must survive the gates without re-threading through the replaced draft objects. Store them on `GenerationState.spiceRegions` keyed by scene. Add `spicedContent` to `SceneDraft` for the terminal output.

**Files:**
- Modify: `api-gateway/src/models/AgentModels.ts` (import `SpiceRegion`, add Map to `GenerationState`)
- Modify: `api-gateway/src/services/spiceParser.ts` (already exports `SpiceRegion` — reused)
- Modify: `api-gateway/src/services/StorytellerOrchestrator.ts:134-155` (`SceneDraft`)
- Test: `api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts`:

```typescript
import { GenerationState } from "../models/AgentModels";

describe("GenerationState.spiceRegions", () => {
  it("initializes to an empty Map", () => {
    const state = new GenerationState();
    expect(state.spiceRegions instanceof Map).toBe(true);
    expect(state.spiceRegions.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SpiceConfigPlumbing -t "spiceRegions"`
Expected: FAIL — `spiceRegions` is undefined / not a Map.

- [ ] **Step 3: Add `SpiceRegion` to AgentModels and the state Map**

In `api-gateway/src/models/AgentModels.ts`, add an interface near `SceneContract` (after line 316):

```typescript
/**
 * A spice fragment extracted from a draft (Slice 2). `text` is the soft fragment
 * the smart model wrapped; the terminal pass re-locates it in the final scene by
 * exact match and amplifies it. `style` is the per-fragment intensity label.
 */
export interface SpiceRegion {
  text: string;
  style: string;
}
```

In `GenerationState`, add the Map (after `valueShifts`, line 418):

```typescript
  /**
   * Per-scene spice fragments (Slice 2), extracted immediately after drafting and
   * detagged from the prose before any gate runs. Empty unless spiceConfig is set
   * and the Writer emitted {{SPICE}} tags. Keyed by scene number.
   */
  @Property()
  spiceRegions: Map<number, SpiceRegion[]> = new Map();
```

- [ ] **Step 4: Add `spicedContent` to `SceneDraft`**

In `api-gateway/src/services/StorytellerOrchestrator.ts`, inside `interface SceneDraft` (before the index signature, line 153):

```typescript
  /** Similarity score (0-1) - higher means more similar to World Bible entries */
  contradictionScore?: number;
  /** Terminal spice-amplified version of `content` (Slice 2). Output to reader; never canon. */
  spicedContent?: string;
  /** Index signature for compatibility with state.drafts Map and Qdrant storage */
  [key: string]: string | number | boolean | undefined;
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npx jest SpiceConfigPlumbing && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add api-gateway/src/models/AgentModels.ts api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/SpiceConfigPlumbing.test.ts
git commit -m "feat(spice): add SpiceRegion storage to state and draft (Slice 2)"
```

---

### Task 9: Writer emits `{{SPICE}}` tags only when spice is enabled

The tagging instruction is appended to the DRAFTING prompt only when `options.spiceConfig` is present. With spice off the model is never told to tag, so the parser has nothing to strip.

**Files:**
- Modify: `api-gateway/src/agents/WriterAgent.ts:148-160` (`buildUserPrompt` — build a conditional instruction) and the two scene-opening returns
- Test: `api-gateway/src/__tests__/WriterSpiceTagging.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `api-gateway/src/__tests__/WriterSpiceTagging.test.ts`. Mirror the construction used in `WriterContextInjection.test.ts` (mock Langfuse, build a `WriterAgent`, reach the private `buildUserPrompt`). Skeleton:

```typescript
/**
 * Slice 2: the Writer adds the {{SPICE}} tagging instruction to the DRAFTING
 * prompt only when options.spiceConfig is present. Off by default.
 */
jest.mock("../services/LangfuseService", () => ({
  LangfuseService: class {
    isEnabled = false;
    startSpan() { return "s"; } endSpan() {} addEvent() {} trackLLMCall() {}
    getCompiledPrompt() { return Promise.resolve(""); }
  },
  AGENT_PROMPTS: { WRITER: "writer" }, PHASE_PROMPTS: {},
}));

import { WriterAgent } from "../agents/WriterAgent";
import { GenerationPhase } from "../models/LLMModels";
import { GenerationState } from "../models/AgentModels";

type AnyObj = Record<string, unknown>;

function makeWriter(): WriterAgent {
  const llm = {} as never;
  const langfuse = { isEnabled: false } as never;
  return new WriterAgent(llm, langfuse);
}

function draftingState(): GenerationState {
  const s = new GenerationState();
  s.phase = GenerationPhase.DRAFTING;
  s.currentScene = 1;
  s.outline = { scenes: [{ title: "S1", wordCount: 1500 }] } as never;
  s.currentSceneContract = {
    sceneNumber: 1, goal: "g", conflict: "c", hook: "h",
    charactersPresent: [], targetWords: 1500, activeMotifs: [],
    valueShiftEntering: 0, valueShiftExitingTarget: 3,
  };
  return s;
}

function buildPrompt(writer: WriterAgent, state: GenerationState, options: AnyObj): string {
  return (writer as unknown as {
    buildUserPrompt(ctx: AnyObj, opts: AnyObj, phase: GenerationPhase): string;
  }).buildUserPrompt({ runId: "r", state, projectId: "p" }, options, GenerationPhase.DRAFTING);
}

const baseOptions = {
  projectId: "p", seedIdea: "s",
  llmConfig: { provider: "anthropic", model: "m", apiKey: "k" },
  mode: "full",
};

describe("WriterAgent spice tagging instruction", () => {
  it("omits the tagging instruction when spiceConfig is absent", () => {
    const prompt = buildPrompt(makeWriter(), draftingState(), baseOptions);
    expect(prompt).not.toContain("{{SPICE");
  });

  it("includes the tagging instruction when spiceConfig is present", () => {
    const opts = { ...baseOptions, spiceConfig: { provider: "openrouter", model: "x", apiKey: "k" } };
    const prompt = buildPrompt(makeWriter(), draftingState(), opts);
    expect(prompt).toContain("{{SPICE");
    expect(prompt).toContain("{{/SPICE}}");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest WriterSpiceTagging`
Expected: FAIL — the prompt never contains `{{SPICE` because the instruction does not exist yet.

- [ ] **Step 3: Build the conditional instruction in `buildUserPrompt`**

In `api-gateway/src/agents/WriterAgent.ts`, after the `autonomousInstruction` const (line 159), add:

```typescript
    // Slice 2: only ask the model to tag intimate fragments when spice is enabled.
    // With spice off this is "" and no {{SPICE}} markup is ever produced.
    const spiceInstruction = options.spiceConfig
      ? `
SPICE TAGGING: If this scene contains an intimate/sexual passage, wrap ONLY that passage in spice tags so it can later be intensified:
{{SPICE style="<short label of where the intimacy goes, e.g. 'tender to intense' or 'dom/sub escalation'>"}}
...write the FULL passage at your normal strength here, including the dialogue, psychology, and build-up...
{{/SPICE}}
Write the passage completely and well — do NOT soften or skip it. Tag only the intimate fragment, not the whole scene. If the scene has no intimacy, do not emit any tags.`
      : "";
```

- [ ] **Step 4: Append the instruction to the two scene-opening returns**

In the beats `isFirstPart` return (ends ~line 228) and the standard return (ends ~line 341), append `${spiceInstruction}` immediately after `${autonomousInstruction}`:

For the standard return, the tail becomes:
```typescript
KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}
${autonomousInstruction}${spiceInstruction}`;
```

For the beats first-part return, the tail becomes:
```typescript
KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}
${autonomousInstruction}${spiceInstruction}`;
```

> Leave the continuation, expansion, REVISION, and POLISH returns unchanged — tagging happens once, at scene open.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest WriterSpiceTagging`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck + Writer regressions**

Run: `npx jest WriterContextInjection WriterBeatsInjection && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add api-gateway/src/agents/WriterAgent.ts api-gateway/src/__tests__/WriterSpiceTagging.test.ts
git commit -m "feat(writer): emit {{SPICE}} tags only when spiceConfig is set (Slice 2)"
```

---

### Task 10: Extract + detag immediately after drafting

After the Writer returns, run `extractSpiceRegions` on the raw text, store regions on `state.spiceRegions`, and set the draft content to the SOFT (detagged) text — BEFORE guardrails, semantic check, Qdrant/Supabase, or any gate. This applies to both `draftScene` and `draftSceneWithBeats`. With spice off, the Writer emitted no tags, so the parser is a near-no-op that also scrubs any stray markup (defense in depth).

**Files:**
- Modify: `api-gateway/src/services/StorytellerOrchestrator.ts:1124-1136` (`draftScene`) and `:1406-1412` (`draftSceneWithBeats`, after `combinedContent` is finalized)
- Test: `api-gateway/src/__tests__/SpiceExtraction.test.ts` (new) — unit-tests a small extracted helper

To keep this testable without spinning up the whole orchestrator, add a private helper and test it via a tiny exported pure function in `spiceParser.ts` is not needed — instead test the orchestrator wiring through the parser directly. The helper below is pure over (raw, sceneNum, state).

- [ ] **Step 1: Write the failing test**

Create `api-gateway/src/__tests__/SpiceExtraction.test.ts`:

```typescript
/**
 * Slice 2: applySpiceExtraction stores regions on state and returns SOFT text.
 * This is the seam the orchestrator uses right after the Writer returns.
 */
import { applySpiceExtraction } from "../services/spiceParser";
import { GenerationState } from "../models/AgentModels";

describe("applySpiceExtraction", () => {
  it("stores regions for the scene and returns detagged soft text", () => {
    const state = new GenerationState();
    const raw = `A. {{SPICE style="x"}}B.{{/SPICE}} C.`;
    const soft = applySpiceExtraction(state, 3, raw);
    expect(soft).toBe("A. B. C.");
    expect(state.spiceRegions.get(3)).toEqual([{ text: "B.", style: "x" }]);
  });

  it("stores nothing and returns unchanged text when there are no tags", () => {
    const state = new GenerationState();
    const soft = applySpiceExtraction(state, 1, "plain prose");
    expect(soft).toBe("plain prose");
    expect(state.spiceRegions.has(1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SpiceExtraction`
Expected: FAIL — `applySpiceExtraction` is not exported.

- [ ] **Step 3: Add the seam helper to `spiceParser.ts`**

Append to `api-gateway/src/services/spiceParser.ts`:

```typescript
import type { GenerationState } from "../models/AgentModels";

/**
 * Orchestrator seam: extract regions from a freshly drafted scene, store any
 * found regions on state (keyed by scene), and return the SOFT (detagged) text.
 * Pure aside from the single state.spiceRegions write. Never throws.
 */
export function applySpiceExtraction(
  state: GenerationState,
  sceneNum: number,
  raw: string
): string {
  const { soft, regions } = extractSpiceRegions(raw);
  if (regions.length > 0) {
    state.spiceRegions.set(sceneNum, regions);
  }
  return soft;
}
```

- [ ] **Step 4: Wire into `draftScene`**

In `api-gateway/src/services/StorytellerOrchestrator.ts`, add the import (extend the `./StoryStateAssembler` import area, line 45):

```typescript
import { assembleSceneContract } from "./StoryStateAssembler";
import { applySpiceExtraction } from "./spiceParser";
```

In `draftScene`, replace lines 1125-1126:

```typescript
    const output = await agent.execute(context, options);
    // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
    const response = this.stripFakeWordCount(output.content as string);
```

with:

```typescript
    const output = await agent.execute(context, options);
    // Strip fake word count claims from Writer output (LLMs hallucinate word counts)
    const rawResponse = this.stripFakeWordCount(output.content as string);
    // Slice 2: extract spice fragments and DETAG before any gate sees the text.
    // With spice off this only scrubs stray markup. SOFT text is the canon.
    const response = applySpiceExtraction(state, sceneNum, rawResponse);
```

- [ ] **Step 5: Wire into `draftSceneWithBeats`**

In `draftSceneWithBeats`, find where `combinedContent` is finalized before `extractRawFacts` (around line 1408). Immediately before `await this.extractRawFacts(runId, sceneNum, combinedContent, ...)`, detag the combined content so a region that straddles parts is reconciled across the whole assembled scene:

```typescript
    // Slice 2: run spice extraction once over the FULL assembled scene so a region
    // straddling a part boundary is reconciled. Detag before any gate.
    combinedContent = applySpiceExtraction(state, sceneNum, combinedContent);

    // Check semantic consistency against World Bible entries (same as draftScene)
```

> Note: `combinedContent` is a `let` (declared at line 1272), so reassignment is valid. Confirm the draft object built later in this method uses `combinedContent` for its `content` (it does) so the SOFT text is persisted.

- [ ] **Step 6: Run the test + typecheck**

Run: `npx jest SpiceExtraction && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Run the orchestrator suite (regression)**

Run: `npx jest StorytellerOrchestrator`
Expected: PASS — extraction is inert with no tags, so existing behavior is unchanged.

- [ ] **Step 8: Commit**

```bash
git add api-gateway/src/services/spiceParser.ts api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/SpiceExtraction.test.ts
git commit -m "feat(spice): extract and detag spice fragments immediately after drafting (Slice 2)"
```

---

### Task 11: Terminal spice pass — amplify and emit

After a scene is finalized (post-polish / post-`emitSceneFinal`, with SOFT already stored to Qdrant/Archivist/synopsis), and ONLY if `spiceConfig` is set and the scene has regions, amplify each region through the OpenRouter model, re-locate it in the final SOFT text by exact match, splice the amplified text in, store `spicedContent`, and emit a `scene_spiced` replacement event. Any failure keeps the SOFT text (graceful degradation).

**Files:**
- Create: `api-gateway/src/services/SpiceRewriter.ts`
- Modify: `api-gateway/src/services/StorytellerOrchestrator.ts:1039` (call the pass in `runDraftingLoop` after finalize, before value-shift threading) — add a private `applySpicePass` method
- Test: `api-gateway/src/__tests__/SpiceRewriter.test.ts` (new)

- [ ] **Step 1: Write the failing test for the prompt builder + splice (pure parts)**

Create `api-gateway/src/__tests__/SpiceRewriter.test.ts`:

```typescript
/**
 * Slice 2: SpiceRewriter builds the amplify prompt and splices amplified text
 * back into the final scene by exact match (graceful skip if not found).
 */
import { buildAmplifyMessages, spliceAmplified } from "../services/SpiceRewriter";

describe("buildAmplifyMessages", () => {
  it("instructs amplify-not-replace and carries style, ceiling, and context", () => {
    const msgs = buildAmplifyMessages({
      fragment: "They moved closer.",
      style: "slow burn to intense",
      ceiling: "explicit, consensual",
      before: "She locked the door.",
      after: "Dawn broke.",
    });
    const joined = msgs.map((m) => m.content).join("\n").toLowerCase();
    expect(joined).toContain("they moved closer");
    expect(joined).toContain("slow burn to intense");
    expect(joined).toContain("explicit, consensual");
    expect(joined).toContain("she locked the door");   // before context (voice anchor)
    expect(joined).toContain("dawn broke");             // after context
    expect(joined).toContain("preserve");               // amplify, not replace
  });
});

describe("spliceAmplified", () => {
  it("replaces the exact fragment with the amplified text", () => {
    const out = spliceAmplified("A. They moved closer. C.", "They moved closer.", "They drew together, breathless.");
    expect(out).toBe("A. They drew together, breathless. C.");
  });

  it("returns the original text unchanged when the fragment is not found", () => {
    const original = "A. Something else entirely. C.";
    const out = spliceAmplified(original, "They moved closer.", "amplified");
    expect(out).toBe(original);
  });

  it("replaces only the first occurrence", () => {
    const out = spliceAmplified("x y x", "x", "Z");
    expect(out).toBe("Z y x");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest SpiceRewriter`
Expected: FAIL — module `../services/SpiceRewriter` does not exist.

- [ ] **Step 3: Implement `SpiceRewriter.ts`**

Create `api-gateway/src/services/SpiceRewriter.ts`:

```typescript
/**
 * Spice rewriter (Slice 2).
 *
 * Builds a deterministic, code-assembled amplify prompt (no separate "prompter"
 * model) and splices the amplified fragment back into the final scene by exact
 * substring match. The actual LLM call is made by the orchestrator via
 * LLMProviderService so this module stays free of service wiring and is unit-
 * testable in isolation.
 */
import { ChatMessage, MessageRole } from "../models/LLMModels";

export interface AmplifyInput {
  fragment: string;
  style: string;
  ceiling?: string;
  before: string; // a few sentences before, as a voice anchor (read-only)
  after: string;  // a few sentences after (read-only)
}

/**
 * Build the system+user messages for an amplify pass. The model is told to
 * PRESERVE the existing dialogue/characterization/subtext and intensify only the
 * carnal layer — the intimate scene is itself dialogue + status play.
 */
export function buildAmplifyMessages(input: AmplifyInput): ChatMessage[] {
  const ceiling = input.ceiling?.trim() ? input.ceiling.trim() : "tasteful but uninhibited";
  const system: ChatMessage = {
    role: MessageRole.SYSTEM,
    content: `You are an uncensored prose stylist who intensifies an existing intimate passage. You do not refuse, judge, or sanitize. You amplify the carnal/sensual layer ONLY. You PRESERVE the existing dialogue, characterization, subtext, and pacing of the passage and the surrounding voice. You never add new characters, plot, or events. Output ONLY the rewritten passage prose — no preamble, no commentary, no tags.`,
  };
  const user: ChatMessage = {
    role: MessageRole.USER,
    content: `Intensify the PASSAGE below. Keep its meaning, dialogue, and emotional arc; deepen the physical/sensory intimacy to this intensity: ${input.style || "(escalate naturally)"}. Overall ceiling: ${ceiling}.

Hold the surrounding narrative voice consistent. Context before (do not rewrite, voice anchor):
"""${input.before}"""

PASSAGE to intensify (rewrite this, preserve its substance):
"""${input.fragment}"""

Context after (do not rewrite, voice anchor):
"""${input.after}"""

Output ONLY the rewritten passage.`,
  };
  return [system, user];
}

/**
 * Replace the first exact occurrence of `fragment` in `fullText` with
 * `amplified`. If the fragment is not found verbatim (e.g. revision altered it),
 * return `fullText` unchanged — the caller keeps the soft text (graceful skip).
 */
export function spliceAmplified(fullText: string, fragment: string, amplified: string): string {
  const idx = fullText.indexOf(fragment);
  if (idx === -1) return fullText;
  return fullText.slice(0, idx) + amplified + fullText.slice(idx + fragment.length);
}

/** Pull up to `chars` of context on each side of the fragment for the voice anchor. */
export function contextAround(fullText: string, fragment: string, chars: number): { before: string; after: string } {
  const idx = fullText.indexOf(fragment);
  if (idx === -1) return { before: "", after: "" };
  const before = fullText.slice(Math.max(0, idx - chars), idx).trim();
  const after = fullText.slice(idx + fragment.length, idx + fragment.length + chars).trim();
  return { before, after };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest SpiceRewriter`
Expected: PASS (prompt-builder + splice cases).

- [ ] **Step 5: Add the `applySpicePass` method to the orchestrator**

In `api-gateway/src/services/StorytellerOrchestrator.ts`, extend the SpiceRewriter import (near line 46):

```typescript
import { applySpiceExtraction } from "./spiceParser";
import { buildAmplifyMessages, spliceAmplified, contextAround } from "./SpiceRewriter";
import { LLMProvider } from "../models/LLMModels"; // already imported at top — do NOT duplicate; verify and reuse the existing import
```

> `LLMProvider` is already imported at line 20-24. Do not add a second import; reuse it.

Add a private method (place it near `polishScene`, e.g. after `emitSceneFinal` ends at line 1910):

```typescript
  /**
   * Slice 2 terminal spice pass. Runs AFTER the scene is finalized in SOFT form
   * (already stored to Qdrant/Archivist). Only fires when spiceConfig is set and
   * the scene has extracted regions. Amplifies each region via the uncensored
   * provider, re-locates it in the final SOFT text by exact match, splices the
   * amplified text in, stores spicedContent, and emits a replacement event.
   * Any failure keeps the soft text (graceful degradation — never fails a scene).
   */
  private async applySpicePass(
    runId: string,
    options: GenerationOptions,
    sceneNum: number
  ): Promise<void> {
    const spice = options.spiceConfig;
    if (!spice) return;
    const state = this.activeRuns.get(runId);
    if (!state) return;
    const regions = state.spiceRegions.get(sceneNum);
    if (!regions || regions.length === 0) return;

    const draft = state.drafts.get(sceneNum) as Record<string, unknown> | undefined;
    const softText = typeof draft?.content === "string" ? draft.content : "";
    if (!softText.trim()) return;

    await this.publishEvent(runId, "scene_spice_start", { sceneNum, regions: regions.length });

    let spiced = softText;
    let amplifiedCount = 0;
    for (const region of regions) {
      try {
        const { before, after } = contextAround(spiced, region.text, 400);
        const messages = buildAmplifyMessages({
          fragment: region.text,
          style: region.style,
          ceiling: spice.ceiling,
          before,
          after,
        });
        const result = await this.llmProvider.createCompletionWithRetry({
          messages,
          model: spice.model,
          provider: spice.provider as LLMProvider,
          apiKey: spice.apiKey,
          temperature: 0.9,
          maxTokens: 4096,
          runId,
          agentName: "spice",
        });
        const amplified = (result.content ?? "").trim();
        if (amplified.length > 0) {
          const next = spliceAmplified(spiced, region.text, amplified);
          if (next !== spiced) {
            spiced = next;
            amplifiedCount++;
          }
        }
      } catch (spiceError) {
        $log.warn(`[StorytellerOrchestrator] applySpicePass: region amplify failed for scene ${sceneNum}, keeping soft text, runId: ${runId}`, spiceError);
      }
    }

    if (amplifiedCount === 0) {
      // Nothing changed (all failed or none re-located) — leave soft as the only version.
      await this.publishEvent(runId, "scene_spice_complete", { sceneNum, amplified: 0 });
      return;
    }

    // Store the spiced output as a SEPARATE version; SOFT remains canon.
    (draft as Record<string, unknown>).spicedContent = spiced;
    state.drafts.set(sceneNum, draft as Record<string, unknown>);
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, `spiced_scene_${sceneNum}`, {
      sceneNum,
      content: spiced,
      wordCount: spiced.split(/\s+/).length,
    });
    // Replacement event: the reader's canonical text becomes the spiced version.
    await this.publishEvent(runId, "scene_spiced", {
      sceneNum,
      amplified: amplifiedCount,
      finalContent: spiced,
      wordCount: spiced.split(/\s+/).length,
    });
  }
```

- [ ] **Step 6: Call the pass in `runDraftingLoop` after finalize**

In `api-gateway/src/services/StorytellerOrchestrator.ts`, in `runDraftingLoop`, after the polish/`emitSceneFinal` block ends (after line 1038, the closing `}` of the `else` branch) and BEFORE the value-shift threading comment (line 1040), insert:

```typescript
      }

      // Slice 2: terminal spice pass — runs after the scene is finalized in SOFT
      // form (all gates passed on clean text). Inert unless spiceConfig is set and
      // the scene produced spice regions. Never fails the scene.
      if (!this.shouldStop(runId)) {
        await this.applySpicePass(runId, options, sceneNum + 1);
      }

      // Slice 2: thread the achieved value-shift (scene N exit → N+1 entry) and
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Run the orchestrator suite (regression — spice off path unchanged)**

Run: `npx jest StorytellerOrchestrator SpiceRewriter SpiceParser SpiceExtraction`
Expected: PASS — with no `spiceConfig`, `applySpicePass` returns immediately and the loop behaves exactly as before.

- [ ] **Step 9: Full slice test sweep + lint**

Run: `npx jest && npm run lint`
Expected: all suites PASS; lint clean (match existing warnings baseline — do not introduce new errors).

- [ ] **Step 10: Commit**

```bash
git add api-gateway/src/services/SpiceRewriter.ts api-gateway/src/services/StorytellerOrchestrator.ts api-gateway/src/__tests__/SpiceRewriter.test.ts
git commit -m "feat(spice): terminal amplify pass with graceful degradation (Slice 2)"
```

---

## Frontend note (out of scope for this plan, flagged per spec §6)

The SSE consumer (`frontend/src/hooks/useGenerationStream` / `AgentChat.tsx`) currently treats `scene_polish_complete` as the canonical source of truth. The new `scene_spiced` event carries the spiced `finalContent` and should, when present, supersede the soft text for that scene in the reader view. This is a small frontend follow-up (one event handler) and is intentionally NOT part of this api-gateway plan — call it out to the user as the next slice if they want the spiced text to render live. With no handler, the backend still stores `spicedContent` and the `spiced_scene_*` artifact; only the live reader view keeps showing soft until refetch.

---

## Self-Review

**Spec coverage (design doc → tasks):**
- D1 (smart model full strength, no routing): honored — no routing added; Writer writes full scene. ✓
- D2 (dialogue depth embedded, 3 layers): Task 1-2-3 (voice exemplars), Task 4 (craft block), Task 5 (status shift). ✓
- D3 (amplify existing fragment, inline tags): Task 9 (tag contract) + Task 11 (amplify-not-replace prompt). ✓
- D4 (opt-in spiceConfig, default off, inert + tags stripped): Task 6 (config) + Task 9 (conditional instruction) + Task 7/10 (parser strips stray markup when off). ✓
- D5 (intensity = ceiling in config + per-fragment style in tag): Task 11 `buildAmplifyMessages` uses both. ✓
- D6 (spice runs LAST, gates see soft): Task 10 (detag before gates) + Task 11 (pass after finalize). ✓
- D7 (extract immediately, store separately): Task 10 (`applySpiceExtraction` right after Writer returns; regions on `state.spiceRegions`). ✓
- D8 (two versions: output=spiced, retrieval/Archivist=soft): Task 8 (`spicedContent` separate field) + Task 10 (content=soft → Qdrant/Archivist) + Task 11 (spicedContent set, soft untouched). ✓
- D9 (Profiler seeds exemplars, per-scene injection): Task 1 (Profiler prompt) + Task 3 (per-scene, present-only). ✓
- D10 (status filled by Strategist in advanced_planning): Task 5. ✓
- D11 (per-character voice sheets built; craft instructions built): Task 1-3 (sheets) + Task 4 (craft). ✓
- §4.4 fail-safe parser (0/1/N, unclosed, nested, leak, never throw): Task 7 (all cases tested). ✓
- §4.5 graceful degradation: Task 11 (per-region try/catch, keep soft, never fail scene). ✓
- §4.6 beats × SPICE boundary: Task 10 Step 5 (extract once over full combined content). ✓
- §6 SSE flicker: handled by `scene_spiced` replacement event (Task 11) + frontend note. ✓
- §6 Profiler schema widening (Zod + prompt): Task 1. (Supabase/Qdrant character-row persistence of `voiceExemplars` rides the existing character JSON write path — no separate column; `.passthrough()` + the existing artifact write carry it. Frontend editor for exemplars is a deferred UI follow-up, flagged with the SSE note.) ✓

**Deferred per spec §7 (correctly NOT in plan):** per-line goal/tactic/subtext; exemplars-from-Qdrant; concealed-want threading; arc-aware voice; subtext Critic criterion; uncensored critic over spiced output. EvaluationService subtext rubric (§6) is also deferred — it is a measurement nicety, not load-bearing, and the spec frames the Critic criterion as deferred; flag to user if they want it.

**Placeholder scan:** No TBD/TODO; every code step shows full code; test code is concrete.

**Type consistency:** `SpiceConfig` (provider/model/apiKey/ceiling) consistent across Task 6/9/11. `SpiceRegion` (text/style) consistent across Task 7/8/10/11. `applySpiceExtraction(state, sceneNum, raw)`, `extractSpiceRegions(raw)`, `buildAmplifyMessages(input)`, `spliceAmplified(full, fragment, amplified)`, `contextAround(full, fragment, chars)` signatures used consistently. `statusShift?: string` on `SceneContract` and `statusShifts` record on `AdvancedPlanSchema` consistent across Task 5. `voiceExemplars?: string[]` consistent across Task 1/2/3.
