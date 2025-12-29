"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_CONFIGS = exports.AGENT_CONFIGS = exports.GenerationState = exports.RawFact = exports.KeyConstraint = exports.AgentMessage = exports.MessageType = exports.AgentType = void 0;
exports.getPhaseConfig = getPhaseConfig;
exports.getNextPhase = getNextPhase;
exports.isAgentActiveInPhase = isAgentActiveInPhase;
const schema_1 = require("@tsed/schema");
const LLMModels_1 = require("./LLMModels");
/**
 * Agent types in the MANOE system
 */
var AgentType;
(function (AgentType) {
    AgentType["ARCHITECT"] = "architect";
    AgentType["PROFILER"] = "profiler";
    AgentType["WORLDBUILDER"] = "worldbuilder";
    AgentType["STRATEGIST"] = "strategist";
    AgentType["WRITER"] = "writer";
    AgentType["CRITIC"] = "critic";
    AgentType["ORIGINALITY"] = "originality";
    AgentType["IMPACT"] = "impact";
    AgentType["ARCHIVIST"] = "archivist";
})(AgentType || (exports.AgentType = AgentType = {}));
/**
 * Message types for agent communication
 */
var MessageType;
(function (MessageType) {
    MessageType["ARTIFACT"] = "artifact";
    MessageType["QUESTION"] = "question";
    MessageType["RESPONSE"] = "response";
    MessageType["OBJECTION"] = "objection";
    MessageType["APPROVAL"] = "approval";
    MessageType["REVISION_REQUEST"] = "revision_request";
})(MessageType || (exports.MessageType = MessageType = {}));
/**
 * Agent message structure
 */
class AgentMessage {
    sender;
    recipient;
    type;
    content;
    artifact;
    timestamp = new Date().toISOString();
    metadata;
}
exports.AgentMessage = AgentMessage;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(AgentType),
    __metadata("design:type", String)
], AgentMessage.prototype, "sender", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Enum)(AgentType),
    __metadata("design:type", String)
], AgentMessage.prototype, "recipient", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(MessageType),
    __metadata("design:type", String)
], AgentMessage.prototype, "type", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], AgentMessage.prototype, "content", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], AgentMessage.prototype, "artifact", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], AgentMessage.prototype, "timestamp", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], AgentMessage.prototype, "metadata", void 0);
/**
 * Key constraint for continuity tracking
 * Uses semantic keys instead of UUIDs for deterministic superseding
 *
 * Immutable constraints (sceneNumber=0) are set during Genesis and never overwritten
 * by Archivist. This prevents context drift (e.g., protagonist name changing mid-story).
 */
class KeyConstraint {
    key;
    value;
    source;
    sceneNumber;
    timestamp;
    reasoning;
    /**
     * If true, this constraint cannot be overwritten by Archivist
     * Used for seed constraints (genre, premise, tone, etc.)
     */
    immutable;
}
exports.KeyConstraint = KeyConstraint;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], KeyConstraint.prototype, "key", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], KeyConstraint.prototype, "value", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], KeyConstraint.prototype, "source", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], KeyConstraint.prototype, "sceneNumber", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], KeyConstraint.prototype, "timestamp", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], KeyConstraint.prototype, "reasoning", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Boolean)
], KeyConstraint.prototype, "immutable", void 0);
/**
 * Raw fact from agents (before Archivist processing)
 */
class RawFact {
    fact;
    source;
    sceneNumber;
    timestamp;
}
exports.RawFact = RawFact;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], RawFact.prototype, "fact", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], RawFact.prototype, "source", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], RawFact.prototype, "sceneNumber", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], RawFact.prototype, "timestamp", void 0);
/**
 * Generation state tracking
 */
class GenerationState {
    phase;
    projectId;
    runId;
    narrative;
    characters = [];
    worldbuilding;
    outline;
    currentScene = 0;
    totalScenes = 0;
    drafts = new Map();
    critiques = new Map();
    revisionCount = new Map();
    messages = [];
    maxRevisions = 2;
    keyConstraints = [];
    rawFactsLog = [];
    lastArchivistScene = 0;
    /**
     * Current scene outline being processed
     * Used to pass expansion mode context to WriterAgent
     */
    currentSceneOutline;
    isPaused = false;
    isCompleted = false;
    error;
    startedAt = new Date().toISOString();
    updatedAt = new Date().toISOString();
}
exports.GenerationState = GenerationState;
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Enum)(LLMModels_1.GenerationPhase),
    __metadata("design:type", String)
], GenerationState.prototype, "phase", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], GenerationState.prototype, "projectId", void 0);
__decorate([
    (0, schema_1.Required)(),
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], GenerationState.prototype, "runId", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], GenerationState.prototype, "narrative", void 0);
__decorate([
    (0, schema_1.CollectionOf)(Object),
    __metadata("design:type", Array)
], GenerationState.prototype, "characters", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], GenerationState.prototype, "worldbuilding", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], GenerationState.prototype, "outline", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], GenerationState.prototype, "currentScene", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], GenerationState.prototype, "totalScenes", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Map)
], GenerationState.prototype, "drafts", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Map)
], GenerationState.prototype, "critiques", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Map)
], GenerationState.prototype, "revisionCount", void 0);
__decorate([
    (0, schema_1.CollectionOf)(AgentMessage),
    __metadata("design:type", Array)
], GenerationState.prototype, "messages", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], GenerationState.prototype, "maxRevisions", void 0);
__decorate([
    (0, schema_1.CollectionOf)(KeyConstraint),
    __metadata("design:type", Array)
], GenerationState.prototype, "keyConstraints", void 0);
__decorate([
    (0, schema_1.CollectionOf)(RawFact),
    __metadata("design:type", Array)
], GenerationState.prototype, "rawFactsLog", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Number)
], GenerationState.prototype, "lastArchivistScene", void 0);
__decorate([
    (0, schema_1.Optional)(),
    (0, schema_1.Property)(),
    __metadata("design:type", Object)
], GenerationState.prototype, "currentSceneOutline", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Boolean)
], GenerationState.prototype, "isPaused", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", Boolean)
], GenerationState.prototype, "isCompleted", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], GenerationState.prototype, "error", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], GenerationState.prototype, "startedAt", void 0);
__decorate([
    (0, schema_1.Property)(),
    __metadata("design:type", String)
], GenerationState.prototype, "updatedAt", void 0);
/**
 * Agent definitions with their roles and active phases
 */
exports.AGENT_CONFIGS = {
    [AgentType.ARCHITECT]: {
        type: AgentType.ARCHITECT,
        name: "Architect",
        description: "Designs story structure, themes, and narrative arc",
        activePhases: [
            LLMModels_1.GenerationPhase.GENESIS,
            LLMModels_1.GenerationPhase.OUTLINING,
            LLMModels_1.GenerationPhase.ADVANCED_PLANNING,
        ],
    },
    [AgentType.PROFILER]: {
        type: AgentType.PROFILER,
        name: "Profiler",
        description: "Creates deep character profiles with psychology and arcs",
        activePhases: [
            LLMModels_1.GenerationPhase.CHARACTERS,
            LLMModels_1.GenerationPhase.NARRATOR_DESIGN,
        ],
    },
    [AgentType.WORLDBUILDER]: {
        type: AgentType.WORLDBUILDER,
        name: "Worldbuilder",
        description: "Develops setting, geography, cultures, and world rules",
        activePhases: [LLMModels_1.GenerationPhase.WORLDBUILDING],
    },
    [AgentType.STRATEGIST]: {
        type: AgentType.STRATEGIST,
        name: "Strategist",
        description: "Plans scene structure, pacing, and narrative beats",
        activePhases: [
            LLMModels_1.GenerationPhase.OUTLINING,
            LLMModels_1.GenerationPhase.ADVANCED_PLANNING,
        ],
    },
    [AgentType.WRITER]: {
        type: AgentType.WRITER,
        name: "Writer",
        description: "Generates prose for scenes with voice and style",
        activePhases: [
            LLMModels_1.GenerationPhase.DRAFTING,
            LLMModels_1.GenerationPhase.REVISION,
            LLMModels_1.GenerationPhase.POLISH,
        ],
    },
    [AgentType.CRITIC]: {
        type: AgentType.CRITIC,
        name: "Critic",
        description: "Evaluates prose quality and provides revision feedback",
        activePhases: [LLMModels_1.GenerationPhase.CRITIQUE, LLMModels_1.GenerationPhase.REVISION],
    },
    [AgentType.ORIGINALITY]: {
        type: AgentType.ORIGINALITY,
        name: "Originality Checker",
        description: "Detects cliches and ensures narrative uniqueness",
        activePhases: [LLMModels_1.GenerationPhase.ORIGINALITY_CHECK],
    },
    [AgentType.IMPACT]: {
        type: AgentType.IMPACT,
        name: "Impact Assessor",
        description: "Evaluates emotional resonance and reader engagement",
        activePhases: [LLMModels_1.GenerationPhase.IMPACT_ASSESSMENT],
    },
    [AgentType.ARCHIVIST]: {
        type: AgentType.ARCHIVIST,
        name: "Archivist",
        description: "Manages continuity constraints and resolves conflicts",
        activePhases: [
            LLMModels_1.GenerationPhase.DRAFTING,
            LLMModels_1.GenerationPhase.REVISION,
            LLMModels_1.GenerationPhase.POLISH,
        ],
    },
};
/**
 * Phase flow configuration
 * Defines the order and structure of generation phases
 */
exports.PHASE_CONFIGS = [
    {
        phase: LLMModels_1.GenerationPhase.GENESIS,
        name: "Genesis",
        description: "Initial story concept and theme development",
        primaryAgent: AgentType.ARCHITECT,
        supportingAgents: [],
        outputArtifact: "narrative",
    },
    {
        phase: LLMModels_1.GenerationPhase.CHARACTERS,
        name: "Characters",
        description: "Character creation with deep psychological profiles",
        primaryAgent: AgentType.PROFILER,
        supportingAgents: [AgentType.ARCHITECT],
        outputArtifact: "characters",
    },
    {
        phase: LLMModels_1.GenerationPhase.NARRATOR_DESIGN,
        name: "Narrator Design",
        description: "Define narrative voice and perspective",
        primaryAgent: AgentType.PROFILER,
        supportingAgents: [AgentType.ARCHITECT],
        outputArtifact: "narrator",
    },
    {
        phase: LLMModels_1.GenerationPhase.WORLDBUILDING,
        name: "Worldbuilding",
        description: "Setting, geography, cultures, and world rules",
        primaryAgent: AgentType.WORLDBUILDER,
        supportingAgents: [AgentType.ARCHITECT],
        outputArtifact: "worldbuilding",
    },
    {
        phase: LLMModels_1.GenerationPhase.OUTLINING,
        name: "Outlining",
        description: "Scene-by-scene story outline",
        primaryAgent: AgentType.STRATEGIST,
        supportingAgents: [AgentType.ARCHITECT],
        outputArtifact: "outline",
    },
    {
        phase: LLMModels_1.GenerationPhase.ADVANCED_PLANNING,
        name: "Advanced Planning",
        description: "Detailed planning with motifs, subtext, and emotional beats",
        primaryAgent: AgentType.STRATEGIST,
        supportingAgents: [AgentType.ARCHITECT],
        outputArtifact: "advanced_plan",
    },
    {
        phase: LLMModels_1.GenerationPhase.DRAFTING,
        name: "Drafting",
        description: "Initial prose generation for each scene",
        primaryAgent: AgentType.WRITER,
        supportingAgents: [AgentType.ARCHIVIST],
        outputArtifact: "draft",
    },
    {
        phase: LLMModels_1.GenerationPhase.CRITIQUE,
        name: "Critique",
        description: "Quality evaluation and feedback",
        primaryAgent: AgentType.CRITIC,
        supportingAgents: [],
        outputArtifact: "critique",
    },
    {
        phase: LLMModels_1.GenerationPhase.REVISION,
        name: "Revision",
        description: "Prose revision based on critique (max 2 iterations)",
        primaryAgent: AgentType.WRITER,
        supportingAgents: [AgentType.CRITIC, AgentType.ARCHIVIST],
        outputArtifact: "revision",
    },
    {
        phase: LLMModels_1.GenerationPhase.ORIGINALITY_CHECK,
        name: "Originality Check",
        description: "Cliche detection and uniqueness verification",
        primaryAgent: AgentType.ORIGINALITY,
        supportingAgents: [],
        outputArtifact: "originality_report",
    },
    {
        phase: LLMModels_1.GenerationPhase.IMPACT_ASSESSMENT,
        name: "Impact Assessment",
        description: "Emotional resonance and engagement evaluation",
        primaryAgent: AgentType.IMPACT,
        supportingAgents: [],
        outputArtifact: "impact_report",
    },
    {
        phase: LLMModels_1.GenerationPhase.POLISH,
        name: "Polish",
        description: "Final prose refinement and consistency check",
        primaryAgent: AgentType.WRITER,
        supportingAgents: [AgentType.ARCHIVIST],
        outputArtifact: "final_draft",
    },
];
/**
 * Get phase config by phase enum
 */
function getPhaseConfig(phase) {
    return exports.PHASE_CONFIGS.find((config) => config.phase === phase);
}
/**
 * Get next phase in the flow
 */
function getNextPhase(currentPhase) {
    const currentIndex = exports.PHASE_CONFIGS.findIndex((config) => config.phase === currentPhase);
    if (currentIndex === -1 || currentIndex === exports.PHASE_CONFIGS.length - 1) {
        return null;
    }
    return exports.PHASE_CONFIGS[currentIndex + 1].phase;
}
/**
 * Check if agent is active in a phase
 */
function isAgentActiveInPhase(agent, phase) {
    const config = exports.AGENT_CONFIGS[agent];
    return config.activePhases.includes(phase);
}
//# sourceMappingURL=AgentModels.js.map