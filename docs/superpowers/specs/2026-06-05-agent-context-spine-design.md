# MANOE Agent-Interaction & Context-Passing Redesign

**Date:** 2026-06-05
**Status:** Design — pending review
**Scope:** Full architectural vision, sequenced. Implementation commits to Slice 0+1 first; later stages gated behind a calibrated Critic.
**Basis:** 6-angle read-only code diagnosis (file:line cited) + 4-angle adversarial research workflow (run `wf_9b9edbd9-f92`) whose critic re-verified every claim against the live tree.

---

## 1. Problem statement

MANOE is a 9-agent long-form narrative engine. On paper it is a collaborative pipeline with a 12-phase quality workflow. In the running code **the agents execute in sequence, largely blind to each other**: the system computes rich state and then discards it before it reaches the agent that needs it. The UI "agent dialogue" is cosmetic (SSE only; never feeds another prompt).

The user's thesis, which this design adopts: **MANOE is fundamentally a prompt-engineering + context-passing product, and its quality ceiling is set by the theory of storytelling encoded in how agents hand context to each other.**

### Confirmed open loops (ground truth — each verified in code)

| Defect | Evidence |
|---|---|
| `worldState` (evolving character status/location/timeline) is **write-only** — never injected into any Writer/Critic prompt | `StorytellerOrchestrator.ts:1952` writes; no reader |
| `advancedPlan` (motifs, subtext, emotional beat-sheet) **computed then dropped** — never written to `state` | `~:866-870`; no `state.advancedPlan` field |
| Narrator/voice/POV design (Profiler) **dropped before the Writer** | `WriterAgent.ts:97-101` |
| Critic never receives **character profiles, worldState, or prior scenes**; **no cross-scene/arc critique**; revision feedback is **lossy**; **last revision never re-critiqued**; sub-threshold scenes **silently accepted** | `CriticAgent.ts:182-249`; loop `StorytellerOrchestrator.ts:935-960` |
| Critic "hard gates" `wordCountCompliance`/`scopeAdherence` **silently stripped by non-passthrough Zod** before the gate reads them | `AgentSchemas.ts:159-166` |
| LOCAL embedding fallback is deterministic **noise** and is the **default**; with the `score>0.5` filter the symptom is **empty retrieval (amnesia)**, not poison | `QdrantMemoryService.ts:88,246-268`; filter `StorytellerOrchestrator.ts:2148/2164` |
| Revised/polished scenes **never re-stored** to Qdrant → later scenes retrieve **stale pre-revision drafts** | `storeScene` uses fresh `uuidv4()` per call; no upsert-by-sceneNumber |
| Originality + Impact agents are **dead code**; EvaluationService is **fire-and-forget** (gates nothing) | no `getAgent(ORIGINALITY/IMPACT).execute()`; `:665,:1145,:1395` |
| **No prompt caching** anywhere in the LLM call path | zero `cache_control`/`ephemeral` in `src` |
| No shared message history — every agent call is a fresh `[system,user]`; context flows only via interpolated state | `BaseAgent.ts:45-48` |

### Non-goals / explicit rejections (YAGNI + cost)

- **No** Dramatica/Story-Grid/Save-the-Cat *superset schema* — one value-shift + beat per scene (prompt bloat the LLM ignores otherwise).
- **No** second/third judge agent under a single BYOK key (correlated noise; Panickssery 2404.13076, Smit 2311.17371).
- **No** multi-agent debate for drafting (homogenizes; the opposite of character distinctiveness).
- **No** whole-story best-of-N as step one (ceiling = broken selector; wastes 2/3 of long generations).
- **No** vector retrieval as the continuity backbone (OFF in LOCAL; rolling synopsis + worldState carry continuity).
- **No** 20k-word verbatim lookback (cost structure doesn't transfer to BYOK).
- **No** persistent chat-thread "shared memory" (structurally impossible — stateless agents).
- **No** braided threads / Weaver yet (deferred until the spine is proven).
- **No** new worldState-extraction machinery (`applyWorldStateDiff` already exists — just unread).

---

## 2. The story model (machine-readable storytelling)

Two typed objects become the authoritative regions of the blackboard. STORY-level is written once (amended on regeneration); SCENE-level is written per scene and threads forward.

### 2.1 Story Bible (STORY-level — semantic memory, written by planners)

```
StoryBible {
  premise: string                      // one paragraph
  genreConventions: string[]           // 3-5 bullets; drives the system-prompt craft slice
  themes: string[]
  narratorVoice: { pov: "1st"|"3rd-limited"|"3rd-omni", tense, register, sampleParagraph }
  motifRegistry: { id, name, intendedPayoffSceneRange }[]
  characterArcs: { characterId, wantVsNeed, startValue, endValue }[]
  beatSpine: { beatId, label, targetSceneRange, oneSentence }[]   // the ONLY structural spine; ~12-20 beats
  worldRules: string[]                 // hard constraints (magic system, tech level, etc.)
}
```

### 2.2 Scene Contract (SCENE-level — working set, written by Strategist per scene)

```
SceneContract {
  sceneNumber: int
  povCharacterId: string
  goal: string                         // what the POV character pursues
  conflict: string                     // the opposing force
  outcome: "yes"|"no"|"yes-but"|"no-and"
  valueShiftEntering: number           // == previous scene's valueShiftExiting (THE thread)
  valueShiftExitingTarget: number
  beatRef: beatId                      // links to Story Bible spine
  activeMotifs: motifId[]              // which motifs this scene must touch
  requiredHook: string                 // the end-condition
  charactersPresent: characterId[]
  targetWords: int
}
```

**The split:** Story Bible = stable canon (cacheable prefix). Scene Contract = per-scene working set (fresh, top of prompt). The single threaded number is **`valueShift`** — scene N's exit becomes N+1's entry. This is the storytelling structure reduced to its load-bearing minimum. Craft frameworks (scene/sequel, show-don't-tell, POV discipline, McKee value-charge) live as **prose guidance in the system prompt**, not as schema fields.

---

## 3. The context spine (the heart)

**Organizing principle: Blackboard** (Hayes-Roth 1985). A typed `StoryState` lives in run state (in-memory + Supabase `run_artifacts`). Every agent's prompt is assembled as `f(named blackboard regions)`, not ad-hoc field interpolation. In Ts.ED terms: a typed `StoryState` threaded via the existing context — **not** a chat thread (there is no shared message history; this is architectural).

### 3.1 Prompt assembly ladder

Ordered top→bottom to exploit primacy/recency (Lost-in-the-Middle, arXiv:2307.03172). Lowest-priority sections drop first under the token cap.

1. System prompt + craft rubric — *static → **cacheable prefix***
2. Story Bible canon: roster names, worldRules, narratorVoice — *static per run → **cacheable prefix***
3. **worldState delta** (current location, who-is-where, time, open threads, character status) — **always-on, never truncated**
4. This-scene **Scene Contract** (goal/conflict/beat/motifs/hook/POV)
5. Rolling synopsis (Archivist, ~50-80 words/scene) — middle, tolerant of degradation
6. Verbatim ~150-word tail of scene N-1
7. *(optional, OFF in LOCAL)* retrieved distant call-backs
8. BOTTOM: repeat hard end-condition + canonical-names guard

### 3.2 Prompt caching is mandatory, not optional

Items 1–2 are identical across Writer + Critic + up to 2 revisions + polish per scene, across all scenes. Without a cached static prefix, every always-on block multiplies token spend linearly — literal money on Bedrock. **Mark the Story Bible + craft rubric + system prompt as a cacheable prefix; put volatile state below the cache breakpoint.** This is the lever that makes the "inject big always-on block" design affordable.

**Caveat — caching is provider-gated, not unconditional.** The read-wiring (items 3–6 of the ladder) is the actual zero-marginal-cost correctness win and does **not** depend on caching. Caching is the *cost optimization* on top, and its mechanism differs by provider (Anthropic-direct `cache_control` ephemeral blocks vs Bedrock prompt caching), and there is no Bedrock client in `LLMProviderService` today. So: caching **degrades gracefully to a no-op** where the provider doesn't support it — it must never block the read-wiring. This is why the roadmap (§8) splits Slice 1 into **1a (read-wiring, unconditional)** and **1b (caching, provider-gated)**.

### 3.3 Per-agent READ/WRITE contract

| Agent | READS | WRITES |
|---|---|---|
| **Architect** | user premise | StoryBible.{premise, genreConventions, themes, beatSpine skeleton} |
| **Profiler → N character agents** | StoryBible.{premise, themes, worldRules} + one-line sibling stubs | one `characterArc` + profile each |
| **Worldbuilder** | StoryBible.{premise, themes} + character roster | StoryBible.worldRules, motifRegistry; seeds initial worldState |
| **Strategist** | full StoryBible | per-scene **SceneContract[]**; **persists `advancedPlan`** (motifs/subtext/beat→scene) to state |
| **Writer** | cacheable prefix + worldState delta + this SceneContract + rolling synopsis + N-1 tail | scene draft |
| **Critic** | **same context the Writer got** + roster + voice + worldState + synopsis-to-N-1 + active motifs + SceneContract + the draft | rubric sub-scores + located feedback + accept/flag |
| **Archivist** | final (revised+polished) scene text + prior worldState | `worldStateDiff` via existing `applyWorldStateDiff`; appends rolling-synopsis entry; records achieved `valueShiftExiting`; re-embeds FINAL text |

### 3.4 Open loops explicitly fixed

- **worldState → Writer:** inject as ladder item 3 (always-on). Machinery (`buildInitialWorldState`/`applyWorldStateDiff`) already exists — this is a **read-wiring fix**.
- **advancedPlan → Writer:** Strategist persists it; inject the per-scene slice as item 4.
- **narrator-voice → Writer:** `StoryBible.narratorVoice` rides the cacheable prefix (item 2) on every call.
- **profiles + worldState + synopsis → Critic:** wired per the table above.

### 3.5 Vector retrieval verdict

OFF by default; **fail-closed** when `EmbeddingProvider === LOCAL` (surface as status, not silent degrade). When a real provider is mandated, retrieval is a discretionary top-up for distant call-backs only, always with metadata filters: `sceneNumber < N` (never retrieve the future), POV/act filter, and **write-back discipline** — upsert scenes on every revision/polish by a deterministic `(projectId, sceneNumber)` ID so revisions overwrite (fixes the stale-Qdrant defect).

---

## 4. The "three stories" decision (derived from theory, sequenced)

Three distinct architectures with different cost/context profiles:

- **(A) Best-of-N whole drafts** — 3 full competing drafts, judge picks. High cost, throws away 2/3, low context-stress, ceiling bounded by judge.
- **(B) Braided parallel threads** — 3 POVs/storylines share one Bible; a Weaver interleaves. Highest quality ceiling, **maximum context-passing stress** (threads must share worldState/timeline/motifs or contradict — exactly MANOE's current weakness).
- **(C) 3-act decomposition** — same narrative, act chunks, shared context. Lowest stress, throughput optimization.

**Decision (sequenced):**
1. **Now:** none. The blackboard read-path + calibrated Critic must exist first.
2. **After context-passing + rubric calibration:** **scene-level best-of-N with diverse craft stances** (immersion-writer / tension-writer / voice-writer personas), selected by **pairwise** comparison with neutralized position order (pairwise > Likert, arXiv:2306.05685). Gain scales with candidate *diversity*, not N. **Gated behind "rubric judge demonstrably calibrated."**
3. **Later, high-ceiling:** **braided threads + Weaver** — the true "theory of storytelling" payoff, but the most context-hungry pattern, so it cannot precede the spine. Treat as a hypothesis to test.

---

## 5. Parallel character creation

Maps to isolate-context sub-agents + blackboard knowledge-sources.

- **Shared read context:** all N character agents read the same `StoryBible.{premise, themes, worldRules}` + a one-line stub of each sibling (name + role + want), so they design *around* each other without seeing full sibling transcripts.
- **Each writes:** one distilled typed `characterArc` + profile — not its full reasoning transcript.
- **Conflict arbitration:** a single **Cast Consistency pass** (one extra call, *not* a debate) reads the full characters region and checks voice distinctiveness, relational coherence, no duplicated arcs, no worldRule violations; writes correction notes; conflicting agents are re-run. **The Strategist is the final arbiter** (it owns the beatSpine the arcs must serve).
- **No debate loop** — debate homogenizes toward consensus, the opposite of the distinctiveness we want.

---

## 6. Critic redesign

**Build on the existing guard clauses — do not replace them** (`CriticAgent.ts:82-109` already enforces hard word-count + scope gates).

### 6.1 Decomposed, anchored rubric

| Axis | judged against |
|---|---|
| Beat delivery | SceneContract beatRef |
| Continuity | worldState + rolling synopsis |
| Character-voice fidelity | character profiles + narratorVoice |
| Prose craft / show-don't-tell | system-prompt craft rules |
| Pacing / scene-sequel (Swain) | — |
| Motif/subtext payoff | SceneContract.activeMotifs |
| **Value-shift delivered** | SceneContract entering→exiting target |

Each axis gets explicit 1-3 / 4-6 / 7-8 / 9-10 anchors. This is **reference-guided grading** (judges markedly more reliable given the intended answer — 2306.05685).

### 6.2 Convergence rules

1. Carry **full critique history** into each revision (Writer sees what was already flagged).
2. **Always re-critique the final revision** — accept or explicitly *flag* sub-threshold (kills silent acceptance).
3. **Located** feedback ("weak motif payoff in beat 3, para 2"), not "improve".
4. Keep **max-2 revisions** — but only meaningful with a final re-score.
5. Emit rubric sub-scores via **structured outputs / tool-use**, not free-text JSON + fence-parsing.

### 6.3 Cross-scene / arc pass

A periodic Critic mode (e.g. per act) reads the rolling synopsis + beatSpine and flags arc-level failures (premature reveal, dropped motif, value-arc stall) that per-scene critique can't see.

### 6.4 Originality / Impact / EvaluationService

- **Originality & Impact → fold in as rubric axes inside the single Critic.** Do **not** revive as separate same-model judges (correlated noise).
- **EvaluationService → wire as a gate** (block accept below a faithfulness threshold) instead of fire-and-forget — but **calibrate against a small human-labeled set first**.
- **A second judge only if cross-model-family** (different provider) — a later A/B experiment, not a build item.

---

## 7. Threshold unification (correctness)

Today: docs say 7, `isApproved` uses ≥8, and a `revision_needed===false` shortcut lets a 7 through. **Unify on a single bar of `score >= 7`** (the documented intent), routing both `isApproved` and `isRevisionNeeded` through one helper and removing the `revision_needed===false` shortcut so a self-reported flag can't bypass the score gate. The `7` is a starting default and is **tunable via calibration** once an eval harness exists (Slice 4 prerequisite) — but it must be a single named constant, not two divergent literals. Restore the Zod-stripped `wordCountCompliance`/`scopeAdherence` fields by **adding them explicitly to `CritiqueSchema`** (preferred over `.passthrough()`, which would let arbitrary keys through) so the hard gates stop reading `undefined`.

---

## 8. Sequenced roadmap

### Slice 0 — prerequisite (near-zero risk)
Fail-closed on LOCAL embeddings: disable `searchScenes/searchCharacters/searchWorldbuilding` when `EmbeddingProvider === LOCAL`; surface as status. Makes experiments interpretable, removes a dead path.

### Slice 1a — read-wiring (unconditional; the actual lever, zero marginal token cost over today's drift)
1. Persist `advancedPlan` to run state in the Strategist (add `advancedPlan?` to `GenerationState`; reuse the existing `AdvancedPlanSchema`).
2. Inject into **Writer** (DRAFTING-phase prompt): worldState delta (top) + advancedPlan slice + narratorVoice (reuses existing `applyWorldStateDiff` output — no new machinery).
3. Inject into **Critic**: the same DRAFTING-phase context the Writer received + roster + worldState + rolling synopsis + SceneContract; add the decomposed rubric (§6) on top of existing guards.
4. **Re-critique the final revision as a score-only pass** (does *not* consume a revision slot — it runs once after the `revisionCount < maxRevisions` loop exits, records the score, and sets an explicit `accepted` | `flagged_subthreshold` status). This closes the silent-acceptance bug without changing the max-2-revisions budget.
5. Unify the threshold to a single `score >= 7` constant (§7); add `wordCountCompliance`/`scopeAdherence` to `CritiqueSchema` so the hard gates stop reading `undefined`.

### Slice 1b — prompt caching (provider-gated cost optimization)
Wrap the static Story Bible + system prompt + rubric in a **cacheable prefix** where the provider supports it (Anthropic-direct `cache_control`). No-op fallback elsewhere. Must not block 1a. Verify the Bedrock mechanism separately if/when a Bedrock client exists.

### Slice 2 — structure (after Slice 1 measured)
Story Bible + Scene Contract schema; value-shift threading; Archivist produces the rolling synopsis every scene; re-embed final scenes with deterministic IDs (when a real embedding provider is present).

### Slice 3 — parallel character creation (§5)

### Slice 4 — scene-level best-of-N with diverse stances (§4.2) — gated behind a calibrated Critic

### Slice 5 — braided threads + Weaver (§4.3) — hypothesis, last

---

## 9. Verification strategy (assertion + token instrumentation)

Per slice, objective and TDD-style — no human labeling required for Slice 0/1:

- **Structural assertions:** the assembled Writer prompt provably contains the worldState delta, narratorVoice, and the scene's advancedPlan slice; the Critic prompt provably contains roster + worldState + synopsis + rubric.
- **Planted-contradiction test:** a fixture where scene N kills a character and scene N+1 has them speak — the Critic must now flag it (it cannot today).
- **Final-revision score:** assert the accepted scene carries a recorded score and an explicit accept/flag status (no silent sub-threshold acceptance).
- **Token/cache instrumentation:** Langfuse per-section token counts; assert cache-hit > 0 on the static prefix across a scene's Writer+Critic+revision calls.

(A calibrated promptfoo/LLM-judge harness is deferred; it becomes a prerequisite before Slice 4's gating/best-of-N is trustworthy.)

---

## 10. Environment constraints carried into implementation

- **LOCAL embeddings are the default** and are noise → Slice 0 fail-closed precedes anything retrieval-dependent.
- **Bedrock client absent** in `LLMProviderService`; under Zscaler MITM the AWS SDK needs the corp CA bundle via a custom `https.Agent`. Prompt caching on Bedrock differs from Anthropic-direct — verify the mechanism before relying on it. (Bedrock provider code is kept local-only per prior decision.)
- **Langfuse 5-min prompt cache TTL**; `config.model` is metadata-only (precedence: request > env > DEFAULT_MODELS). Moving craft/rubric text into Langfuse prompts inherits the TTL.
- **No shared message history** — all cross-agent context is interpolated state, never a chat thread.

---

## Appendix — key source files

`api-gateway/src/services/StorytellerOrchestrator.ts` (645/1952-1957 worldState wiring; 935-960 revision loop; 2144-2174 retrieval+score filter) · `api-gateway/src/agents/ArchivistAgent.ts` (168 buildInitialWorldState, 232 applyWorldStateDiff) · `api-gateway/src/agents/CriticAgent.ts` (82-109 existing guards; 182-249 prompt) · `api-gateway/src/agents/WriterAgent.ts` (97-101 system vars) · `api-gateway/src/services/QdrantMemoryService.ts` (88 LOCAL default; 246-268 noise embedder) · `api-gateway/src/schemas/AgentSchemas.ts` (159-166 CritiqueSchema; 310 worldStateDiff) · `api-gateway/src/models/AgentModels.ts` (GenerationState, phase configs).

**Research provenance:** primary sources include Lost-in-the-Middle (2307.03172), Chroma Context Rot, Anthropic effective-context-engineering, Re3 (2210.06774), DOC (2212.10077), RecurrentGPT (2305.13304), MT-Bench/LLM-judge (2306.05685), Reflexion (2303.11366), Self-Refine (2303.17651), Huang self-correction limits (2310.01798), Panickssery self-preference (2404.13076), Smit MAD (2311.17371), Hayes-Roth blackboard (1985); production patterns from Sudowrite, NovelCrafter, NovelAI, AI Dungeon docs. Full reports + adversarial critique in workflow run `wf_9b9edbd9-f92`.
