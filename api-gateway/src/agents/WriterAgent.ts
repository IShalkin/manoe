/**
 * Writer Agent
 * 
 * Generates prose for scenes with voice and style.
 * Active in: Drafting, Revision, Polish phases
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class WriterAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.WRITER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    // Get system prompt from Langfuse or fallback
    const systemPrompt = await this.getSystemPrompt(context, options);

    // Build user prompt based on phase
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Emit thought for Cinematic UI
    if (phase === GenerationPhase.DRAFTING) {
      await this.emitThought(runId, "Analyzing scene structure and character motivations...", "neutral");
    } else if (phase === GenerationPhase.REVISION) {
      await this.emitThought(runId, "Revising based on critique feedback...", "neutral", AgentType.CRITIC);
    }

    // Call LLM
    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    // Apply guardrails for prose content
    if (phase === GenerationPhase.DRAFTING || 
        phase === GenerationPhase.REVISION || 
        phase === GenerationPhase.POLISH) {
      // Apply guardrails
      await this.applyGuardrails(response, state.keyConstraints, runId);
      
      // Emit the actual generated content for the frontend to display
      // Pass sceneNum as fourth parameter for frontend deduplication
      await this.emitMessage(runId, { content: response, sceneNumber: state.currentScene }, phase, state.currentScene);
      
      // Emit completion thought
      if (phase === GenerationPhase.DRAFTING) {
        await this.emitThought(runId, "Draft complete. Awaiting Critic's feedback.", "neutral", AgentType.CRITIC);
      } else if (phase === GenerationPhase.REVISION) {
        await this.emitThought(runId, "Revision complete. Ready for re-evaluation.", "neutral", AgentType.CRITIC);
      } else if (phase === GenerationPhase.POLISH) {
        await this.emitThought(runId, "Polish complete. Scene finalized.", "excited");
      }
      
      return { content: response };
    }

    // For other phases, parse as JSON
    const content = this.parseJSON(response);
    // Emit the actual generated content for the frontend to display
    await this.emitMessage(runId, content as Record<string, unknown>, phase);
    return { content: content as Record<string, unknown> };
  }

  /**
   * Get system prompt from Langfuse or fallback
   */
  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.WRITER;
    const constraintsBlock = this.buildConstraintsBlock(context.state.keyConstraints);
    
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
      characters: JSON.stringify(context.state.characters || []),
      keyConstraints: constraintsBlock,
    };

    if (this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  /**
   * Get fallback prompt
   * CRITICAL: Includes autonomous agent instruction to prevent persona break
   */
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

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  /**
   * Build user prompt based on phase
   * CRITICAL: All prompts include autonomous agent instruction to prevent persona break
   */
  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    const state = context.state;
    const constraintsBlock = this.buildConstraintsBlock(state.keyConstraints);
    
    // Critical instruction to prevent persona break - added to ALL user prompts
    // This cannot be overridden by Langfuse system prompts
    const autonomousInstruction = `
CRITICAL: Output ONLY the story prose. DO NOT ask questions. DO NOT offer options (A/B/C). DO NOT include meta-commentary like "Here is the scene" or "Which approach would you prefer". Just write the story content directly.`;

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

    if (phase === GenerationPhase.DRAFTING) {
      const sceneNum = state.currentScene;
      const outline = state.outline as Record<string, unknown>;
      const scenes = (outline?.scenes as unknown[]) || [];
      const sceneOutline = state.currentSceneOutline ?? (scenes[sceneNum - 1] as Record<string, unknown>) ?? {};
      const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);

      // Slice 2: always-on continuity + craft guidance for ALL drafting paths
      // (standard, beats first-part, beats continuation, expansion).
      const worldStateBlock = this.buildWorldStateBlock(state.worldState);
      const advancedPlanBlock = this.buildAdvancedPlanBlock(state.advancedPlan, sceneNum);
      const narratorVoiceBlock = this.buildNarratorVoiceBlock(state.narratorVoice);
      const synopsisBlock = this.buildSynopsisBlock(state.rollingSynopsis, sceneNum);
      const sceneContractBlock = this.buildSceneContractBlock(state.currentSceneContract);

      const presentCharacters = state.currentSceneContract?.charactersPresent ?? [];
      const voiceExemplarsBlock = this.buildVoiceExemplarsBlock(state.characters, presentCharacters);

      // Check if this is a Proactive Beats Method request (generating scene in parts)
      if (sceneOutline.beatsMode === true) {
        const partIndex = Number(sceneOutline.partIndex ?? 1);
        const partsTotal = Number(sceneOutline.partsTotal ?? 3);
        const partTargetWords = Number(sceneOutline.partTargetWords ?? 500);
        
        // FAIL-FAST: Validate beats mode parameters to catch NaN issues early
        if (isNaN(partIndex) || isNaN(partsTotal) || isNaN(partTargetWords)) {
          throw new Error(`Invalid beats mode parameters: partIndex=${partIndex}, partsTotal=${partsTotal}, partTargetWords=${partTargetWords}`);
        }
        
        const existingContent = String(sceneOutline.existingContent ?? "");
        const isFirstPart = sceneOutline.isFirstPart === true;
        const isFinalPart = sceneOutline.isFinalPart === true;
        const retrievedContext = String(sceneOutline.retrievedContext ?? "");

        if (isFirstPart) {
          // First part: Start the scene fresh
          return `Write Part 1 of ${partsTotal} for Scene ${sceneNum}: "${sceneTitle}"

WORLD STATE (authoritative continuity — do NOT contradict):
${worldStateBlock}

NARRATOR VOICE (write in this voice consistently):
${narratorVoiceBlock}

CHARACTER VOICES (keep them distinct):
${voiceExemplarsBlock}

STORY SO FAR (prior scenes — for continuity, do not re-narrate):
${synopsisBlock}

SCENE CONTRACT (deliver exactly this):
${sceneContractBlock}

STORY CRAFT PLAN (weave these in):
${advancedPlanBlock}

Scene outline:
${JSON.stringify(sceneOutline, null, 2)}

BEATS METHOD INSTRUCTION:
You are writing Part 1 of ${partsTotal} parts for this scene.
Write approximately ${partTargetWords} words for this first part.

Requirements:
- Begin the scene with a strong opening
- Establish the setting and initial situation
- DO NOT try to complete the entire scene - you are only writing the first part
- End at a natural transition point (not a cliffhanger, just a good pause point)
- Leave room for the story to continue in subsequent parts

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}
${autonomousInstruction}${spiceInstruction}`;
        } else {
          // Continuation parts (2, 3, 4...)
          // Use 50 words of context (not 20) to maintain narrative voice and tone consistency
          const lastWords = existingContent.trim().split(/\s+/).slice(-50).join(" ");
          const lastChars = lastWords.length > 300 ? lastWords.slice(-300) : lastWords;

          const partInstruction = isFinalPart
            ? `This is the FINAL part. You MUST conclude the scene and end with the specified hook.`
            : `This is Part ${partIndex} of ${partsTotal}. End at a natural transition point for the next part.`;

          return `Continue Scene ${sceneNum}: "${sceneTitle}" - Part ${partIndex} of ${partsTotal}

WORLD STATE (authoritative continuity — do NOT contradict):
${worldStateBlock}

CRITICAL INSTRUCTION: Return ONLY the continuation text. Do NOT repeat any previous text.

The scene so far ends with:
"...${lastChars}"

Write approximately ${partTargetWords} more words to continue from that exact point.

${partInstruction}

Requirements:
- Start your response with NEW content only - continue naturally from where the text left off
- DO NOT include any text that already exists in the scene
- DO NOT repeat the ending shown above
- Continue seamlessly maintaining the same voice, tone, and style
${isFinalPart ? "- End with the specified hook from the scene outline" : "- Progress the scene toward its conclusion"}

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}
${autonomousInstruction}`;
        }
      }

      // Check if this is an expansion request (scene too short, need to continue)
      if (sceneOutline.expansionMode === true) {
        const existingContent = String(sceneOutline.existingContent ?? "");
        const additionalWordsNeeded = Number(sceneOutline.additionalWordsNeeded ?? 500);
        
        // Get the last ~100 characters, breaking at word boundary to avoid mid-word/mid-character cuts
        // This prevents UTF-8 issues with multi-byte characters (emojis, special chars)
        const lastWords = existingContent.trim().split(/\s+/).slice(-15).join(" ");
        const lastChars = lastWords.length > 100 ? lastWords.slice(-100) : lastWords;
        
        return `Continue Scene ${sceneNum}: "${sceneTitle}"

WORLD STATE (authoritative continuity — do NOT contradict):
${worldStateBlock}

CRITICAL INSTRUCTION: Return ONLY the continuation text. Do NOT repeat any previous text.

The scene ends with:
"...${lastChars}"

Write approximately ${additionalWordsNeeded} more words to continue from that exact point.

Requirements:
- Start your response with NEW content only - continue naturally from where the text left off
- If the ending above is mid-sentence, complete that sentence first, then continue
- DO NOT include any text that already exists in the scene
- DO NOT repeat the ending shown above
- Continue seamlessly maintaining the same voice, tone, and style
- Progress the scene toward its conclusion

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${autonomousInstruction}`;
      }

      // Include retrieved context from Qdrant for hallucination prevention
      const retrievedContext = String(sceneOutline.retrievedContext ?? "");

      return `Write Scene ${sceneNum}: "${sceneTitle}"

WORLD STATE (authoritative continuity — do NOT contradict):
${worldStateBlock}

NARRATOR VOICE (write in this voice consistently):
${narratorVoiceBlock}

CHARACTER VOICES (keep them distinct):
${voiceExemplarsBlock}

STORY SO FAR (prior scenes — for continuity, do not re-narrate):
${synopsisBlock}

SCENE CONTRACT (deliver exactly this):
${sceneContractBlock}

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
${autonomousInstruction}${spiceInstruction}`;
    }

    if (phase === GenerationPhase.REVISION) {
      const sceneNum = state.currentScene;
      const draft = state.drafts.get(sceneNum);
      const critiques = state.critiques.get(sceneNum) || [];
      const latestCritique = critiques[critiques.length - 1] as Record<string, unknown> || {};

      if (!draft) {
        throw new Error(`No draft found for scene ${sceneNum}`);
      }

      // Get scene outline for context (goals, hook, characters)
      const outline = state.outline as Record<string, unknown>;
      const scenes = (outline?.scenes as unknown[]) || [];
      const sceneOutline = state.currentSceneOutline ?? (scenes[sceneNum - 1] as Record<string, unknown>) ?? {};
      
      // Include retrieved context from Qdrant for hallucination prevention
      const retrievedContext = String(sceneOutline.retrievedContext ?? "");

      // Build canonical character names block to prevent name amnesia
      const characterNames = this.buildCanonicalNamesBlock(state.characters);

      return `Revise Scene ${sceneNum} based on critique feedback.

CANONICAL NAMES (DO NOT INTRODUCE NEW NAMED CHARACTERS):
${characterNames}

CHARACTER PROFILES:
${JSON.stringify(state.characters || [], null, 2)}

SCENE OUTLINE (goals, hook, characters):
${JSON.stringify(sceneOutline, null, 2)}

Original draft:
${(draft as Record<string, unknown>).content}

Critique feedback:
Issues: ${JSON.stringify(latestCritique.issues || [])}
Revision requests: ${JSON.stringify(latestCritique.revisionRequests || [])}

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}
${retrievedContext}

CRITICAL: When revising, you MUST:
- Use ONLY the canonical character names listed above
- Do NOT introduce new named characters not in the character profiles
- Maintain consistency with established facts and character traits
${autonomousInstruction}`;
    }

    if (phase === GenerationPhase.POLISH) {
      const sceneNum = state.currentScene;
      const draft = state.drafts.get(sceneNum);

      if (!draft) {
        throw new Error(`No draft found for scene ${sceneNum}`);
      }

      const currentWordCount = ((draft as Record<string, unknown>).content as string)?.split(/\s+/).length ?? 0;

      return `Polish Scene ${sceneNum} for final publication quality.

Current draft (${currentWordCount} words):
${(draft as Record<string, unknown>).content}

Polish for:
- Sentence flow and rhythm
- Word choice precision
- Consistency in voice
- Final proofreading

CRITICAL REQUIREMENTS:
- You MUST output the FULL polished text of the entire scene
- Do NOT truncate or leave notes like "rest is the same" or "continues with same content"
- Do NOT shorten or summarize - the polished version must be at least ${currentWordCount} words
- Output EVERY SINGLE WORD of the polished scene from beginning to end
- Preserve all story beats and plot points
${autonomousInstruction}`;
    }

    throw new Error(`WriterAgent not configured for phase: ${phase}`);
  }

  /**
   * Detect persona break patterns in Writer output
   * Returns true if the output contains interactive assistant patterns
   */
  public detectPersonaBreak(content: string): boolean {
    const personaBreakPatterns = [
      /which (?:approach|option|version) (?:would you|do you) prefer/i,
      /\b[ABC]\)\s+/,  // A) B) C) options
      /your guidance/i,
      /let me know (?:if|which|what)/i,
      /would you like me to/i,
      /here (?:is|are) (?:the|some) (?:revised|options|approaches)/i,
      /please (?:choose|select|let me know)/i,
      /\?{2,}/,  // Multiple question marks
    ];

    return personaBreakPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Build canonical names block from character profiles
   * Used to prevent "name amnesia" where LLM introduces new character names during revision
   */
  private buildCanonicalNamesBlock(characters: unknown): string {
    if (!characters || !Array.isArray(characters)) {
      return "No characters established yet.";
    }

    const names: string[] = [];
    for (const char of characters) {
      if (typeof char === "object" && char !== null) {
        const charObj = char as Record<string, unknown>;
        // Extract name from various possible fields
        const name = charObj.name || charObj.fullName || charObj.characterName;
        if (typeof name === "string" && name.trim()) {
          names.push(name.trim());
        }
      }
    }

    if (names.length === 0) {
      return "No named characters established yet.";
    }

    return names.map(name => `- ${name}`).join("\n");
  }
}

