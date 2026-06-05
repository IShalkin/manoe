/**
 * StoryStateAssembler (Slice 2)
 *
 * Pure functions that assemble the typed blackboard views (StoryBible,
 * SceneContract) from existing GenerationState regions. No I/O, no LLM calls —
 * just a deterministic projection so prompts are built from named regions
 * rather than ad-hoc field interpolation.
 */
import { GenerationState, StoryBible, SceneContract } from "../models/AgentModels";

type AnyObj = Record<string, unknown>;

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

export function assembleStoryBible(state: GenerationState): StoryBible {
  const narrative = (state.narrative ?? {}) as AnyObj;
  const worldbuilding = (state.worldbuilding ?? {}) as AnyObj;
  const characters = Array.isArray(state.characters) ? state.characters : [];

  const roster = characters.map((c) => {
    const rec = c as AnyObj;
    return { name: String(rec.name ?? rec.fullName ?? "?"), role: String(rec.role ?? rec.archetype ?? "") };
  });

  const genre = narrative.genre;
  const genreConventions = asStringArray(narrative.genreConventions).concat(
    typeof genre === "string" && genre.trim() ? [genre] : []
  );

  return {
    premise: typeof narrative.premise === "string" ? narrative.premise : "",
    themes: asStringArray(narrative.themes),
    genreConventions,
    narratorVoice: state.narratorVoice,
    worldRules: asStringArray(worldbuilding.rules ?? worldbuilding.worldRules),
    roster,
  };
}

export function assembleSceneContract(state: GenerationState, sceneNum: number): SceneContract {
  const outline = (state.outline ?? {}) as AnyObj;
  const scenes = Array.isArray(outline.scenes) ? (outline.scenes as AnyObj[]) : [];
  const scene = (scenes[sceneNum - 1] ?? {}) as AnyObj;

  const plan = (state.advancedPlan ?? {}) as AnyObj;
  const motifsObj = (plan.motifs && typeof plan.motifs === "object" && !Array.isArray(plan.motifs))
    ? (plan.motifs as AnyObj)
    : {};
  const activeMotifs = Object.keys(motifsObj);

  const charactersPresent = asStringArray(scene.characters);
  const valueShifts = state.valueShifts instanceof Map ? state.valueShifts : new Map<number, number>();
  const entering = sceneNum > 1 ? (valueShifts.get(sceneNum - 1) ?? 0) : 0;

  return {
    sceneNumber: sceneNum,
    goal: typeof scene.goal === "string" ? scene.goal : "",
    conflict: typeof scene.conflict === "string" ? scene.conflict : "",
    hook: typeof scene.hook === "string" ? scene.hook : (typeof scene.endHook === "string" ? scene.endHook : ""),
    charactersPresent,
    targetWords: typeof scene.wordCount === "number" ? scene.wordCount : 1500,
    activeMotifs,
    valueShiftEntering: entering,
    valueShiftExitingTarget: entering + 3, // default intent: move the charge meaningfully
  };
}
