"use strict";
/**
 * Agent Factory
 *
 * Factory for creating and managing agent instances.
 * Uses dependency injection through Ts.ED and caches agent instances.
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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFactory = void 0;
const di_1 = require("@tsed/di");
const AgentModels_1 = require("../models/AgentModels");
const LLMProviderService_1 = require("../services/LLMProviderService");
const LangfuseService_1 = require("../services/LangfuseService");
const RedisStreamsService_1 = require("../services/RedisStreamsService");
const ArchitectAgent_1 = require("./ArchitectAgent");
const ProfilerAgent_1 = require("./ProfilerAgent");
const WorldbuilderAgent_1 = require("./WorldbuilderAgent");
const StrategistAgent_1 = require("./StrategistAgent");
const WriterAgent_1 = require("./WriterAgent");
const CriticAgent_1 = require("./CriticAgent");
const OriginalityAgent_1 = require("./OriginalityAgent");
const ImpactAgent_1 = require("./ImpactAgent");
const ArchivistAgent_1 = require("./ArchivistAgent");
const guardrails_1 = require("../guardrails");
let AgentFactory = class AgentFactory {
    llmProvider;
    langfuse;
    contentGuardrail;
    consistencyGuardrail;
    redisStreams;
    agents = new Map();
    constructor(llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams) {
        this.llmProvider = llmProvider;
        this.langfuse = langfuse;
        this.contentGuardrail = contentGuardrail;
        this.consistencyGuardrail = consistencyGuardrail;
        this.redisStreams = redisStreams;
    }
    /**
     * Get agent instance by type
     * Creates and caches agent instances
     */
    getAgent(agentType) {
        if (!this.agents.has(agentType)) {
            this.agents.set(agentType, this.createAgent(agentType));
        }
        return this.agents.get(agentType);
    }
    /**
     * Create agent instance
     */
    createAgent(agentType) {
        console.log(`[AgentFactory] Creating agent: ${agentType}, hasRedisStreams: ${!!this.redisStreams}`);
        switch (agentType) {
            case AgentModels_1.AgentType.ARCHITECT:
                const architect = new ArchitectAgent_1.ArchitectAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
                console.log(`[AgentFactory] ArchitectAgent created, redisStreams in instance: ${!!architect.redisStreams}`);
                return architect;
            case AgentModels_1.AgentType.PROFILER:
                return new ProfilerAgent_1.ProfilerAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.WORLDBUILDER:
                return new WorldbuilderAgent_1.WorldbuilderAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.STRATEGIST:
                return new StrategistAgent_1.StrategistAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.WRITER:
                return new WriterAgent_1.WriterAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.CRITIC:
                return new CriticAgent_1.CriticAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.ORIGINALITY:
                return new OriginalityAgent_1.OriginalityAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.IMPACT:
                return new ImpactAgent_1.ImpactAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            case AgentModels_1.AgentType.ARCHIVIST:
                return new ArchivistAgent_1.ArchivistAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
            default:
                throw new Error(`Unknown agent type: ${agentType}`);
        }
    }
};
exports.AgentFactory = AgentFactory;
exports.AgentFactory = AgentFactory = __decorate([
    (0, di_1.Service)(),
    __param(0, (0, di_1.Inject)()),
    __param(1, (0, di_1.Inject)()),
    __param(2, (0, di_1.Inject)()),
    __param(3, (0, di_1.Inject)()),
    __param(4, (0, di_1.Inject)()),
    __metadata("design:paramtypes", [LLMProviderService_1.LLMProviderService,
        LangfuseService_1.LangfuseService,
        guardrails_1.ContentGuardrail,
        guardrails_1.ConsistencyGuardrail,
        RedisStreamsService_1.RedisStreamsService])
], AgentFactory);
//# sourceMappingURL=AgentFactory.js.map