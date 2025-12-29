/**
 * State Graph Model
 *
 * Defines the state machine for narrative generation workflow
 */
import { GenerationPhase } from "./LLMModels";
import { AgentType } from "./AgentModels";
/**
 * State node in the generation graph
 */
export interface StateNode {
    id: string;
    phase: GenerationPhase;
    status: "pending" | "active" | "completed" | "failed";
    agent: AgentType;
    transitions: StateTransition[];
}
/**
 * State transition condition
 */
export interface StateTransition {
    to: string;
    condition?: string;
}
/**
 * Generation state graph
 * Defines all possible states and transitions in the generation workflow
 */
export declare const GENERATION_GRAPH: StateNode[];
/**
 * Get state node by ID
 */
export declare function getStateNode(id: string): StateNode | undefined;
/**
 * Get state node by phase
 */
export declare function getStateNodeByPhase(phase: GenerationPhase): StateNode | undefined;
/**
 * Get next possible states from current state
 */
export declare function getNextStates(currentStateId: string, context?: Record<string, unknown>): StateNode[];
//# sourceMappingURL=StateGraph.d.ts.map