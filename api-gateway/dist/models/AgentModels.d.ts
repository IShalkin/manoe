/**
 * Agent Models and Types for MANOE Multi-Agent Orchestration
 *
 * Defines the 9 specialized agents and their communication protocols:
 * - Architect: Story structure and narrative design
 * - Profiler: Character creation and psychology
 * - Worldbuilder: Setting and world details
 * - Strategist: Scene planning and pacing
 * - Writer: Prose generation
 * - Critic: Quality evaluation and feedback
 * - Originality: Cliche detection and uniqueness
 * - Impact: Emotional resonance assessment
 * - Archivist: Constraint management and continuity
 */
import { GenerationPhase } from "./LLMModels";
/**
 * Agent types in the MANOE system
 */
export declare enum AgentType {
    ARCHITECT = "architect",
    PROFILER = "profiler",
    WORLDBUILDER = "worldbuilder",
    STRATEGIST = "strategist",
    WRITER = "writer",
    CRITIC = "critic",
    ORIGINALITY = "originality",
    IMPACT = "impact",
    ARCHIVIST = "archivist"
}
/**
 * Message types for agent communication
 */
export declare enum MessageType {
    ARTIFACT = "artifact",
    QUESTION = "question",
    RESPONSE = "response",
    OBJECTION = "objection",
    APPROVAL = "approval",
    REVISION_REQUEST = "revision_request"
}
/**
 * Cinematic event types for real-time UI visualization
 */
export type CinematicEventType = "agent_thought" | "agent_dialogue" | "agent_conflict" | "agent_consensus";
/**
 * Agent thought event (for Cinematic UI)
 */
export interface AgentThoughtEvent {
    type: "agent_thought";
    data: {
        agent: AgentType;
        thought: string;
        sentiment: "neutral" | "agree" | "disagree" | "excited" | "concerned";
        targetAgent?: AgentType;
    };
}
/**
 * Agent dialogue event (for Cinematic UI)
 */
export interface AgentDialogueEvent {
    type: "agent_dialogue";
    data: {
        from: AgentType;
        to: AgentType;
        message: string;
        dialogueType: "question" | "objection" | "approval" | "suggestion";
    };
}
/**
 * Agent conflict event (for Cinematic UI)
 */
export interface AgentConflictEvent {
    type: "agent_conflict";
    data: {
        agents: [AgentType, AgentType];
        issue: string;
        resolution?: string;
    };
}
/**
 * Agent consensus event (for Cinematic UI)
 */
export interface AgentConsensusEvent {
    type: "agent_consensus";
    data: {
        agents: AgentType[];
        decision: string;
    };
}
/**
 * Agent message structure
 */
export declare class AgentMessage {
    sender: AgentType;
    recipient?: AgentType;
    type: MessageType;
    content: string;
    artifact?: Record<string, unknown>;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
/**
 * Key constraint for continuity tracking
 * Uses semantic keys instead of UUIDs for deterministic superseding
 */
export declare class KeyConstraint {
    key: string;
    value: string;
    source: AgentType;
    sceneNumber: number;
    timestamp: string;
    reasoning?: string;
}
/**
 * Raw fact from agents (before Archivist processing)
 */
export declare class RawFact {
    fact: string;
    source: AgentType;
    sceneNumber: number;
    timestamp: string;
}
/**
 * Generation state tracking
 */
export declare class GenerationState {
    phase: GenerationPhase;
    projectId: string;
    runId: string;
    narrative?: Record<string, unknown>;
    characters: Record<string, unknown>[];
    worldbuilding?: Record<string, unknown>;
    outline?: Record<string, unknown>;
    currentScene: number;
    totalScenes: number;
    drafts: Map<number, Record<string, unknown>>;
    critiques: Map<number, Record<string, unknown>[]>;
    revisionCount: Map<number, number>;
    messages: AgentMessage[];
    maxRevisions: number;
    keyConstraints: KeyConstraint[];
    rawFactsLog: RawFact[];
    lastArchivistScene: number;
    isPaused: boolean;
    isCompleted: boolean;
    error?: string;
    startedAt: string;
    updatedAt: string;
}
/**
 * Agent configuration
 */
export interface AgentConfig {
    type: AgentType;
    name: string;
    description: string;
    systemPrompt: string;
    activePhases: GenerationPhase[];
}
/**
 * Phase configuration
 */
export interface PhaseConfig {
    phase: GenerationPhase;
    name: string;
    description: string;
    primaryAgent: AgentType;
    supportingAgents: AgentType[];
    outputArtifact: string;
}
/**
 * Agent definitions with their roles and active phases
 */
export declare const AGENT_CONFIGS: Record<AgentType, Omit<AgentConfig, "systemPrompt">>;
/**
 * Phase flow configuration
 * Defines the order and structure of generation phases
 */
export declare const PHASE_CONFIGS: PhaseConfig[];
/**
 * Get phase config by phase enum
 */
export declare function getPhaseConfig(phase: GenerationPhase): PhaseConfig | undefined;
/**
 * Get next phase in the flow
 */
export declare function getNextPhase(currentPhase: GenerationPhase): GenerationPhase | null;
/**
 * Check if agent is active in a phase
 */
export declare function isAgentActiveInPhase(agent: AgentType, phase: GenerationPhase): boolean;
//# sourceMappingURL=AgentModels.d.ts.map