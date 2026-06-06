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
