/**
 * Agent Types and Interfaces
 * 
 * Defines common interfaces for agent execution context and output
 */

import { GenerationState, AgentType, RawFact } from "../models/AgentModels";

/**
 * LLM Configuration for generation
 */
export interface LLMConfiguration {
  provider: string;
  model: string;
  apiKey: string;
  temperature?: number;
}

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

/**
 * Context passed to agent execute method
 */
export interface AgentContext {
  runId: string;
  state: GenerationState;
  projectId: string;
}

/**
 * Output from agent execution
 */
export interface AgentOutput {
  content: Record<string, unknown> | Record<string, unknown>[] | string;
  rawFacts?: RawFact[];  // For Archivist agent
  messages?: {
    sender: AgentType;
    recipient?: AgentType;
    type: 'agent_thought' | 'agent_dialogue' | 'agent_conflict' | 'agent_consensus';
    content: string;
    metadata?: Record<string, unknown>;
  }[];
}

/**
 * Generation options passed to agents
 */
export interface GenerationOptions {
  projectId: string;
  seedIdea: string;
  llmConfig: LLMConfiguration;
  mode: "full" | "branching";
  settings?: Record<string, unknown>;
  spiceConfig?: SpiceConfig;
}

