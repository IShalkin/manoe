/**
 * Archivist Agent
 * 
 * Manages continuity constraints and resolves conflicts.
 * Active in: Drafting, Revision, Polish phases (runs every 3 scenes)
 */

import { AgentType, RawFact, KeyConstraint, WorldState, CharacterState, LocationState, TimelineFact } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ArchivistOutputSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class ArchivistAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.ARCHIVIST, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options);

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      GenerationPhase.DRAFTING // Archivist runs during drafting phase
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, ArchivistOutputSchema, runId);
    
    // Extract key constraints from response
    const constraints = this.extractConstraints(validated as Record<string, unknown>, state.currentScene);

    // Emit thought for Cinematic UI
    await this.emitThought(runId, "Processing continuity constraints and resolving conflicts...", "neutral");
    
    // Emit the actual generated content for the frontend to display
    await this.emitMessage(runId, validated as Record<string, unknown>, GenerationPhase.DRAFTING);
    
    if (constraints.length > 0) {
      await this.emitThought(runId, `Updated ${constraints.length} key constraints.`, "neutral");
    }

    return {
      content: validated as Record<string, unknown>,
      rawFacts: constraints.map(c => ({
        fact: `${c.key}: ${c.value}`,
        source: AgentType.ARCHIVIST,
        sceneNumber: c.sceneNumber,
        timestamp: new Date().toISOString(),
      })),
    };
  }

  /**
   * Extract key constraints from Archivist validated response
   */
  private extractConstraints(
    validated: { constraints?: Array<{ key: string; value: string; sceneNumber: number; reasoning?: string }> },
    sceneNumber: number
  ): KeyConstraint[] {
    const constraints: KeyConstraint[] = [];

    if (validated.constraints && Array.isArray(validated.constraints)) {
      for (const constraint of validated.constraints) {
        constraints.push({
          key: constraint.key,
          value: constraint.value,
          source: AgentType.ARCHIVIST,
          sceneNumber: constraint.sceneNumber ?? sceneNumber,
          timestamp: new Date().toISOString(),
          reasoning: constraint.reasoning,
        });
      }
    }

    return constraints;
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.ARCHIVIST;

    if (this.langfuse.isEnabled) {
      try {
        return await this.langfuse.getCompiledPrompt(
          promptName,
          {},
          { fallback: this.getFallbackPrompt() }
        );
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.getFallbackPrompt();
  }

  private getFallbackPrompt(): string {
    return `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`;
  }

  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): string {
    const state = context.state;
    const upToScene = state.currentScene;
    const rawFacts = state.rawFactsLog.filter(f => f.sceneNumber <= upToScene);
    const existingConstraints = state.keyConstraints;
    const existingWorldState = state.worldState;

    return `Process raw facts and generate/update key constraints up to Scene ${upToScene}.

Raw facts collected:
${rawFacts.map(f => `- ${f.fact} (Scene ${f.sceneNumber}, from ${f.source})`).join("\n")}

Existing constraints:
${existingConstraints.map(c => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`).join("\n")}

Current world state:
${existingWorldState ? JSON.stringify(existingWorldState, null, 2) : "No world state yet."}

Process:
1. Identify new facts that should become constraints
2. Resolve conflicts (keep most recent by timestamp)
3. Discard irrelevant or redundant facts
4. Generate updated constraint list
5. Update world state with character status changes, new locations, timeline events

Output JSON with:
- constraints: array of {key, value, sceneNumber, reasoning}
- conflicts_resolved: string[]
- discarded_facts: string[]
- worldStateDiff: {
    characterUpdates: array of {name, status, currentLocation, newAttributes}
    newLocations: array of {name, type, description}
    timelineEvents: array of {event, significance}
  }`;
  }

  /**
   * Build initial world state from character profiles
   * Called after Characters phase to initialize world state
   */
  public buildInitialWorldState(
    runId: string,
    characters: Record<string, unknown>[]
  ): WorldState {
    const characterStates: CharacterState[] = characters.map((char) => ({
      name: String(char.name || char.fullName || "Unknown"),
      aliases: Array.isArray(char.aliases) ? char.aliases.map(String) : [],
      role: String(char.role || char.archetype || "unknown"),
      status: "alive" as const,
      currentLocation: undefined,
      attributes: this.extractAttributes(char),
      relationships: this.extractRelationships(char),
      lastSeenScene: 0,
    }));

    return {
      runId,
      lastUpdatedScene: 0,
      lastUpdatedAt: new Date().toISOString(),
      characters: characterStates,
      locations: [],
      organizations: [],
      timeline: [],
      keyFacts: [],
    };
  }

  /**
   * Extract character attributes from profile
   */
  private extractAttributes(char: Record<string, unknown>): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrFields = ["age", "occupation", "appearance", "personality", "motivation", "flaw"];
    
    for (const field of attrFields) {
      if (char[field] && typeof char[field] === "string") {
        attrs[field] = char[field] as string;
      }
    }
    
    return attrs;
  }

  /**
   * Extract character relationships from profile
   */
  private extractRelationships(char: Record<string, unknown>): Record<string, string> {
    const rels: Record<string, string> = {};
    
    if (char.relationships && typeof char.relationships === "object") {
      const relObj = char.relationships as Record<string, unknown>;
      for (const [key, value] of Object.entries(relObj)) {
        if (typeof value === "string") {
          rels[key] = value;
        }
      }
    }
    
    return rels;
  }

  /**
   * Apply world state diff from Archivist output
   */
  public applyWorldStateDiff(
    currentState: WorldState,
    diff: Record<string, unknown>,
    sceneNumber: number
  ): WorldState {
    const newState = { ...currentState };
    newState.lastUpdatedScene = sceneNumber;
    newState.lastUpdatedAt = new Date().toISOString();

    // Apply character updates
    if (diff.characterUpdates && Array.isArray(diff.characterUpdates)) {
      for (const update of diff.characterUpdates) {
        const charUpdate = update as Record<string, unknown>;
        const charName = String(charUpdate.name || "");
        const existingChar = newState.characters.find(c => c.name === charName);
        
        if (existingChar) {
          if (charUpdate.status) {
            existingChar.status = charUpdate.status as CharacterState["status"];
          }
          if (charUpdate.currentLocation) {
            existingChar.currentLocation = String(charUpdate.currentLocation);
          }
          if (charUpdate.newAttributes && typeof charUpdate.newAttributes === "object") {
            existingChar.attributes = {
              ...existingChar.attributes,
              ...(charUpdate.newAttributes as Record<string, string>),
            };
          }
          existingChar.lastSeenScene = sceneNumber;
        }
      }
    }

    // Add new locations
    if (diff.newLocations && Array.isArray(diff.newLocations)) {
      for (const loc of diff.newLocations) {
        const locData = loc as Record<string, unknown>;
        const newLoc: LocationState = {
          name: String(locData.name || "Unknown"),
          type: String(locData.type || "unknown"),
          description: locData.description ? String(locData.description) : undefined,
          status: "accessible",
          lastMentionedScene: sceneNumber,
        };
        
        // Only add if not already exists
        if (!newState.locations.find(l => l.name === newLoc.name)) {
          newState.locations.push(newLoc);
        }
      }
    }

    // Add timeline events
    if (diff.timelineEvents && Array.isArray(diff.timelineEvents)) {
      for (const event of diff.timelineEvents) {
        const eventData = event as Record<string, unknown>;
        const newEvent: TimelineFact = {
          event: String(eventData.event || ""),
          sceneNumber,
          significance: (eventData.significance as TimelineFact["significance"]) || "minor",
          timestamp: new Date().toISOString(),
        };
        newState.timeline.push(newEvent);
      }
    }

    return newState;
  }
}

