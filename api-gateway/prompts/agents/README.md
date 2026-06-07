# MANOE Agent Seed Skills

Role-specific system prompts for the 9 MANOE agents, derived from the canonical
**Storytelling Alchemist: Unbound** framework (12-stage manual, see
`docs/storytelling-framework/`).

## Why these exist

The framework was written **for a human author** — a 12-stage manual of craft
theory (McKee Controlling Idea, Jung archetypes/shadow, Swain scene/sequel,
T.S. Eliot objective correlative, Hitchcock suspense, Pinter pauses). The
original n8n implementation flattened each stage into a one-line agent prompt
(*"You are a dialogue specialist."*) — all the craft stayed in the manual and
never reached the model. These files close that gap: they translate the
human-facing craft into **agent system prompts**.

## What a seed skill is (and isn't)

Each file is the **system-prompt layer** for one agent: persona + craft rules +
output discipline. It is *craft-dense*, not schema-dense — the exact JSON shape
is injected at runtime by each agent's `buildUserPrompt()`. Do not hardcode the
full schema here; describe the contract at a craft level and defer the literal
structure to the task message.

These files serve two consumers:

1. **Runtime fallback / Langfuse seed** — the text behind `getFallbackPrompt()`
   and the `manoe-<agent>-v1` Langfuse prompt. (Wiring is a separate step; these
   files are the source of truth for that text.)
2. **SkillOpt `init_skill`** — seed skills for prompt-as-weights training
   (`C:\Users\shalkin\orchestration\SkillOpt`). Format follows SkillOpt's
   skill-document convention (`# Title`, `## sections` of rules). Training
   refines them via LLM-judge reward; a good seed converges faster than a blank one.

## 12 framework stages → 9 agents

| Agent | Output | Framework stages it owns |
|---|---|---|
| **architect** | JSON (Narrative / AdvancedPlan / outline) | 1 Genesis (seed, moral compass, audience) · 2.1–2.2 structure + McKee Controlling Idea |
| **profiler** | JSON (Characters[] / Narrator) | 3 Character Alchemy (wound, ≥2 contradictions, defense, shadow, arc) · 7.1 distinct voices · 6 narrator |
| **worldbuilder** | JSON (Worldbuilding) | 4 World & Atmosphere · 5 Symbolic Resonance (motifs, objective correlative, sensory motifs) |
| **strategist** | JSON (Outline / AdvancedPlan) | 2.3–2.6 plot points/setup-payoff/foreshadowing · 6 POV+distance · 9 Drive & Tension (hooks, pacing) |
| **writer** | PROSE | 7 Dialogue Craft · 5.x show-don't-tell/subtext · 8.2 embodied empathy |
| **critic** | JSON (Critique) | 11.1 rigorous self-critique · 6.1 critique areas |
| **originality** | JSON (OriginalityReport) | 10 Originality & Innovation (cliché subversion, genre blend, experimental structure) |
| **impact** | JSON (ImpactReport) | 8 Emotional & Ethical Depth (emotional arcs, empathy, catharsis/ambiguity ending) |
| **archivist** | JSON (ArchivistOutput) | 11.4 loop + 12.3 continuity/consistency pass — cross-cutting state tracker |

## Cross-cutting principles (all agents)

- **Ethical agnosticism.** The framework is a neutral tool; the run's Moral
  Compass (set at Genesis) dictates moral direction. Agents serve the chosen
  compass, they do not impose one.
- **Show, don't tell; subtext over statement.** ≥60% of motivation and theme
  stays implicit (the Iceberg Principle).
- **Earned, not decorative.** Every motif, symbol, status move, and emotional
  beat must do narrative work tied to a plot point or arc stage — never ornament.
