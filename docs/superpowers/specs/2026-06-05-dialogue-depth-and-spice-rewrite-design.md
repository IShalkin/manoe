# MANOE Dialogue-Depth & Spice-Rewrite Design

**Date:** 2026-06-05
**Status:** Design — pending review
**Scope:** Two additive enhancements to the Writer path. (A) Deepen dialogue via subtext/status/voice inside the existing draft prompt. (B) An opt-in "spice" rewrite pass that amplifies intimate fragments through an uncensored OpenRouter model, applied AFTER all quality gates.
**Basis:** Read-only code walk (file:line cited below) + 6-angle adversarial research workflow (run `wf_2f1be485-2be`, 23 sources, 24/25 claims confirmed) + a screenwriter/senior-agentic-dev risk pass. This is a hobby project; copyright/plagiarism is explicitly out of scope per author.

---

## 1. Problem statement

Two distinct quality gaps in MANOE's prose, raised by the author:

1. **Flat dialogue.** A single smart model writes a whole scene in one pass; characters tend to state feelings outright ("chatbot having feelings"), speak in one homogenized voice, and lack subtext. This is the dominant LLM dialogue failure mode (research, high confidence).
2. **Censored intimate scenes.** The strongest writers (Anthropic/OpenAI) self-censor or sanitize explicit content. The author wants those smart models to keep writing the full scene (psychology, dialogue, build-up, as in *Gone Girl*), and have only the intimate fragment amplified for spice by an uncensored model — minimizing any quality loss.

Both gaps live around the Writer. The engine is already a plan-first hierarchical pipeline (outline → advanced_planning → per-scene drafting), which research names as the single most transferable pattern for dialogue coherence — so we are architecturally in the right place. The work is enriching prompts and adding one terminal pass, not restructuring the phase machine.

### Research grounding (run `wf_2f1be485-2be`)

| Finding | Confidence | Use here |
|---|---|---|
| Generate dialogue LAST, conditioned on structural artifacts (Dramatron CHI 2023; Agents' Room ICLR 2025) | high | Already true in MANOE; we lean on it |
| Few-shot **voice exemplars** beat trait summaries; brief summaries are the *specific cause* of stereotyped/same-voice output | high | Feature A, layer 1 |
| Voice exemplars get **evicted from context** as history grows (SillyTavern) | high | Re-inject per scene, only for present characters |
| Subtext = goal/tactic/subtext + "talk between the lines"; on-the-nose is the amateur marker | medium/high | Feature A, layer 2 (craft instructions) |
| **Status play** (Johnstone): every line shifts power; flat scenes lack status movement | medium | Feature A, layer 3 (new `SceneContract` field) |
| Dedicated **show-don't-tell rewrite pass** is real practitioner practice (Sudowrite Rewrite) | medium | Validates B's "amplify, not replace" shape |

### Verified caveats (carried forward, not papered over)

- **REFUTED (1-2 votes):** there is NO confirmed standard practice of a "professional screenwriter persona + explicit negative instruction." Our craft block is a *recommended synthesis*, not an observed industry pattern. Treat as a hypothesis to tune.
- **No benchmark** exists for "separate deepening pass vs. embedded instructions" or for per-line goal/tactic/subtext cost/quality. We chose embedded (cheaper, no voice-flattening risk); per-line decomposition is deferred.
- **Language transfer unproven.** All craft sources are English screenwriting; MANOE is Russian-facing. On-the-nose tolerance is culture/genre dependent. Prompts must be tuned against real Russian output, not assumed.
- Status (Johnstone, power axis) ≠ valueShift (McKee, emotional valence). Modeled as **separate** fields.

---

## 2. Design decisions (locked with author)

| # | Decision |
|---|---|
| D1 | Smart model writes the full scene at full strength. NO "write softly" instruction. NO per-content-type routing (dialogue→Opus / nature→GPT idea is **rejected**). |
| D2 | Dialogue depth = embedded in the Writer prompt (not a separate pass), with three layers: voice exemplars (1) + craft/anti-on-the-nose instructions (2) + per-beat status shift (3). Per-line goal/tactic/subtext deferred. |
| D3 | Spice = amplify the existing fragment, not generate from scratch. Smart model marks intimate fragments inline with `{{SPICE style="..."}}…{{/SPICE}}`. |
| D4 | Spice is opt-in via a separate `spiceConfig` (provider=openrouter, model, apiKey), **default off**. No config ⇒ feature inert, tags stripped, nothing leaks. |
| D5 | Spice intensity/style = base ceiling in `spiceConfig` + per-fragment `style` in the tag (smart model writes the *label*, not explicit prose). |
| D6 | **Spice runs LAST**, after guardrails + Critic + revision + polish. All gates see the clean SOFT text (uncensored models never block, never refuse, never judge unfaithful). |
| D7 | Tags are extracted to a separate field **immediately after drafting**; prose is detagged before any gate. Tags never survive into critique/revision (so they cannot be lost there). |
| D8 | Per-scene we keep TWO versions: **output = spiced**, **retrieval/Archivist/synopsis = soft** (clean canon; smart model never gets explicit context in later scenes). |
| D9 | Voice exemplars: Profiler drafts them in CHARACTERS phase; author edits; stored in the character profile; injected per scene. |
| D10 | Status shift field filled by Strategist in advanced_planning (it already produces the per-scene craft plan). |
| D11 | Two voice libraries: (A) per-character voice sheets (built), and (B) distilled craft instructions derived from freely-available dialogue-writing material (built as static prompt text, optionally with annotated exemplars). |

---

## 3. Feature A — Dialogue depth (inside the draft prompt)

Three layers, all within the single existing draft call (zero added LLM calls):

### 3.1 Layer 1 — Per-character voice exemplars
- New profile field, e.g. `voiceExemplars: string[]` (3-5 characteristic lines per character: rhythm, idiolect, what they interrupt with, what they leave unsaid).
- **Authoring (D9):** Profiler generates a draft in CHARACTERS phase; author edits/replaces; persisted to profile.
- **Injection:** Writer injects exemplars **per scene** (D9), **only for `SceneContract.charactersPresent`** (token budget), and **presents them together with contrast emphasis** — voices distinguish only in opposition, not in isolation (screenwriter note).
- Long-form caveat: exemplars are re-injected each scene because they get evicted from context otherwise.
- Arc note (open): static exemplars fight character development. v1 frames them as "baseline voice, drift allowed as the arc demands"; richer arc-aware voice deferred.

### 3.2 Layer 2 — Craft instructions (distilled, + library B)
Static block, best placed in the **system prompt** (Langfuse-versioned), NOT the already-bloated user prompt (see §6 risk):
- Subtext via indirection ("talk between the lines"; characters pursue hidden goals obliquely).
- Anti-on-the-nose negative constraints: do not name emotions directly; do not fill strategic silences; the "chatbot having feelings" mode is banned; depth lives in what characters refuse to say.
- **Carry subtext through action**, not only lines: action/reaction, physical business, objects, pauses (screenwriter note — otherwise we get witty lines in a vacuum).
- Optional few-shot exemplars from library (B) with a "why this works" annotation (annotation improves technique transfer; plagiarism not a concern here).

### 3.3 Layer 3 — Per-beat status shift (new `SceneContract` field)
- Add a field distinct from `valueShiftEntering/valueShiftExitingTarget` (those are McKee emotional valence; status is Johnstone power). E.g. `statusShift?: string` describing how power between present characters moves across the scene (start opposed → reverse, etc.).
- **Filled by Strategist** in advanced_planning (D10); rendered by the Writer's craft block.
- Subtext-readability dependency (screenwriter note): the reader must know the character's hidden *want* for the gap between said/meant to land. `SceneContract.goal` is the scene's goal; consider threading the character's concealed want too (open item).

---

## 4. Feature B — Spice rewrite (terminal pass)

### 4.1 Tagging contract
Smart model wraps intimate fragments: `{{SPICE style="from intellectual sparring to dom/sub, escalating"}} …full Opus-written arc… {{/SPICE}}`. The fragment may be large and contain its own escalation (the model writes the whole psychological-to-physical arc; spice amplifies the carnal layer along it).

### 4.2 Lifecycle (the load-bearing ordering — D6, D7)
```
DRAFTING  (Opus, full strength, dialogue-deepened, with {{SPICE}} tags)
   │
   ├─ extract spice fragment(s) → SceneDraft.spiceRegions[] {text, style}
   │  detag prose immediately                              (D7)
   ▼
applyGuardrails ─ CRITIQUE ─ REVISION* ─ POLISH   (all on SOFT, detagged text)
   ▼
[scene approved in SOFT form]
   ├─ SOFT  → Qdrant + Archivist (extractRawFacts) + rolling synopsis   (clean canon, D8)
   └─ SPICE PASS (only if spiceConfig present AND spiceRegions non-empty):
        for each region: OpenRouter rewrite = amplify(region.text,
            context = N sentences before/after [read-only, voice anchor],
            style = region.style + spiceConfig ceiling)
        splice amplified text back at recorded coordinates
        SPICED → final output to reader / export   (D8)
```

### 4.3 Prompt assembly
Deterministic, **code-built** (no separate "prompter" model). Template = amplify-not-replace instruction + region text + before/after context (hold this voice) + `style` (tag) + ceiling (config). Intimate scenes are themselves dialogue + status (dom/sub *is* status play) — the amplifier is told to preserve the existing dialogue/characterization/subtext and intensify only the carnal layer.

### 4.4 Fail-safe parser (mandatory)
Tags are a contract with a stochastic model. The parser MUST handle: 0 / 1 / N fragments; unclosed tags; nested tags; tags emitted in a non-intimate scene; tags omitted entirely; and a literal `{{SPICE}}` that would otherwise **leak to the reader** if spice is off. Rule: strip any orphan/unparseable markup, never render markup, never throw.

### 4.5 Graceful degradation
Spice is +1 call on a different provider (its own key, limits, reliability). On any failure (refusal, timeout, error), **keep the soft Opus text** and continue — never fail the scene.

### 4.6 beatsMode interaction
The engine already splits scenes into parts (`WriterAgent` beatsMode, Part 1 of N). A `{{SPICE}}` region may straddle a part boundary (Part 1 ends mid-region). Extraction must reconcile tags across assembled parts before detagging, or constrain the model to keep a region within one part. (Implementation detail; flagged.)

---

## 5. What we do NOT touch

Phase state machine; scene engine internals (beatsMode/expansion) beyond §4.6; Critic rubric (v1 — deferred, see open items); the artifact write path contract (we *extend* `SceneDraft`, we do not break resume / selective regeneration); model-selection precedence. Both features are additive.

## 6. Cross-cutting risks (spec'd as requirements, defaults obvious)

- **Writer prompt bloat / lost-in-the-middle.** The draft user prompt is already large (worldState + advancedPlan + sceneContract + constraints + scope + autonomous + retrievedContext). Put craft rules in the system prompt; keep per-scene injections minimal (present characters only).
- **Profiler schema widening.** `voiceExemplars` touches Zod (`AgentSchemas`), Supabase, Qdrant character rows (keep SQL row ↔ Qdrant point in sync), the frontend editor, and Profiler's prompt + output validation. Migration is wider than it looks.
- **Two-version storage.** `SceneDraft` carries soft + spiced; Qdrant gets SOFT only — state this explicitly so the "SQL row ↔ Qdrant point" invariant is honored with the soft text as canon.
- **SSE flicker.** Content streams live via `emitMessage`. If spice is a post-pass, the reader sees soft then it swaps to spiced. Decide: hold the stream until after spice, or stream soft then patch. (UX vs latency; default: stream soft, emit a spiced replacement event.)
- **Evaluation.** No benchmark for A. Add a "subtext / on-the-nose" rubric to `EvaluationService` so quality is measurable, not eyeballed.

## 7. Open questions (deferred, not blocking)

1. Russian-language tuning of the craft block (the one unverified transfer; tune against real output).
2. Per-line goal/tactic/subtext — worth the tokens/mechanical-feel risk? (deferred)
3. Voice exemplars from Qdrant (real lines from prior scenes) as an upgrade over Profiler-seed sheets.
4. Thread the character's concealed *want* (not just scene goal) into the prompt so subtext is readable.
5. Arc-aware voice evolution vs. static voice sheet.
6. Whether a subtext-focused Critic criterion (route bad dialogue to revision) should follow once A is proven.
7. Optional later: uncensored critic pass over spiced output (characterization/voice check).

## 8. Sequencing

- **Slice 1 (A):** voice exemplars (Profiler draft + profile field + per-scene injection) + craft system-prompt block + `SceneContract.statusShift` filled by Strategist. Measurable via eval rubric.
- **Slice 2 (B):** `spiceConfig` plumbing + tagging instruction + fail-safe extractor (immediately post-draft) + two-version `SceneDraft` + terminal amplify pass + graceful degradation. Gated behind opt-in config.

Slices are independent; A delivers value with spice entirely off.
