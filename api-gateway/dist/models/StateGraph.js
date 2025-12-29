"use strict";
/**
 * State Graph Model
 *
 * Defines the state machine for narrative generation workflow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATION_GRAPH = void 0;
exports.getStateNode = getStateNode;
exports.getStateNodeByPhase = getStateNodeByPhase;
exports.getNextStates = getNextStates;
const LLMModels_1 = require("./LLMModels");
const AgentModels_1 = require("./AgentModels");
/**
 * Generation state graph
 * Defines all possible states and transitions in the generation workflow
 */
exports.GENERATION_GRAPH = [
    {
        id: "genesis",
        phase: LLMModels_1.GenerationPhase.GENESIS,
        status: "pending",
        agent: AgentModels_1.AgentType.ARCHITECT,
        transitions: [{ to: "characters" }],
    },
    {
        id: "characters",
        phase: LLMModels_1.GenerationPhase.CHARACTERS,
        status: "pending",
        agent: AgentModels_1.AgentType.PROFILER,
        transitions: [{ to: "narrator" }],
    },
    {
        id: "narrator",
        phase: LLMModels_1.GenerationPhase.NARRATOR_DESIGN,
        status: "pending",
        agent: AgentModels_1.AgentType.PROFILER,
        transitions: [{ to: "worldbuilding" }],
    },
    {
        id: "worldbuilding",
        phase: LLMModels_1.GenerationPhase.WORLDBUILDING,
        status: "pending",
        agent: AgentModels_1.AgentType.WORLDBUILDER,
        transitions: [{ to: "outlining" }],
    },
    {
        id: "outlining",
        phase: LLMModels_1.GenerationPhase.OUTLINING,
        status: "pending",
        agent: AgentModels_1.AgentType.STRATEGIST,
        transitions: [{ to: "advanced_planning" }],
    },
    {
        id: "advanced_planning",
        phase: LLMModels_1.GenerationPhase.ADVANCED_PLANNING,
        status: "pending",
        agent: AgentModels_1.AgentType.STRATEGIST,
        transitions: [{ to: "drafting" }],
    },
    {
        id: "drafting",
        phase: LLMModels_1.GenerationPhase.DRAFTING,
        status: "pending",
        agent: AgentModels_1.AgentType.WRITER,
        transitions: [{ to: "critique" }],
    },
    {
        id: "critique",
        phase: LLMModels_1.GenerationPhase.CRITIQUE,
        status: "pending",
        agent: AgentModels_1.AgentType.CRITIC,
        transitions: [
            { to: "revision", condition: "revision_needed === true" },
            { to: "originality", condition: "revision_needed === false" },
        ],
    },
    {
        id: "revision",
        phase: LLMModels_1.GenerationPhase.REVISION,
        status: "pending",
        agent: AgentModels_1.AgentType.WRITER,
        transitions: [{ to: "critique" }], // Loop back to critique
    },
    {
        id: "originality",
        phase: LLMModels_1.GenerationPhase.ORIGINALITY_CHECK,
        status: "pending",
        agent: AgentModels_1.AgentType.ORIGINALITY,
        transitions: [{ to: "impact" }],
    },
    {
        id: "impact",
        phase: LLMModels_1.GenerationPhase.IMPACT_ASSESSMENT,
        status: "pending",
        agent: AgentModels_1.AgentType.IMPACT,
        transitions: [{ to: "polish" }],
    },
    {
        id: "polish",
        phase: LLMModels_1.GenerationPhase.POLISH,
        status: "pending",
        agent: AgentModels_1.AgentType.WRITER,
        transitions: [], // Terminal state
    },
];
/**
 * Get state node by ID
 */
function getStateNode(id) {
    return exports.GENERATION_GRAPH.find((node) => node.id === id);
}
/**
 * Get state node by phase
 */
function getStateNodeByPhase(phase) {
    return exports.GENERATION_GRAPH.find((node) => node.phase === phase);
}
/**
 * Get next possible states from current state
 */
function getNextStates(currentStateId, context) {
    const currentNode = getStateNode(currentStateId);
    if (!currentNode)
        return [];
    const nextStates = [];
    for (const transition of currentNode.transitions) {
        // Evaluate condition if present
        if (transition.condition && context) {
            try {
                // Simple condition evaluation (in production, use a proper expression evaluator)
                const conditionResult = evaluateCondition(transition.condition, context);
                if (conditionResult) {
                    const nextNode = getStateNode(transition.to);
                    if (nextNode)
                        nextStates.push(nextNode);
                }
            }
            catch (error) {
                console.warn(`Failed to evaluate condition: ${transition.condition}`, error);
            }
        }
        else {
            // No condition, always transition
            const nextNode = getStateNode(transition.to);
            if (nextNode)
                nextStates.push(nextNode);
        }
    }
    return nextStates;
}
/**
 * Simple condition evaluator
 * Supports: ===, !==, === true, === false
 */
function evaluateCondition(condition, context) {
    // Remove whitespace
    const clean = condition.trim();
    // Handle === true / === false
    if (clean.endsWith("=== true")) {
        const key = clean.replace("=== true", "").trim();
        return context[key] === true;
    }
    if (clean.endsWith("=== false")) {
        const key = clean.replace("=== false", "").trim();
        return context[key] === false;
    }
    // Handle === / !==
    if (clean.includes("===")) {
        const [key, value] = clean.split("===").map((s) => s.trim());
        return context[key] === value;
    }
    if (clean.includes("!==")) {
        const [key, value] = clean.split("!==").map((s) => s.trim());
        return context[key] !== value;
    }
    // Default: check if key exists and is truthy
    return Boolean(context[clean]);
}
//# sourceMappingURL=StateGraph.js.map