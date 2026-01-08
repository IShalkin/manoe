"use strict";
/**
 * Metrics Service for MANOE
 * Provides Prometheus metrics for observability and monitoring
 *
 * Features:
 * - Agent success/failure rate tracking
 * - LLM latency histograms (p50, p95, p99)
 * - Token usage counters
 * - Cost tracking per model/provider
 * - Redis Streams lag monitoring
 * - Qdrant health metrics
 * - Database query timing
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
exports.MetricsService = void 0;
const di_1 = require("@tsed/di");
const prom_client_1 = require("prom-client");
/**
 * Model pricing in USD per 1K tokens
 * Updated pricing as of 2024
 */
const MODEL_PRICING = {
    // OpenAI models
    "gpt-4": { input: 0.03, output: 0.06 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    "o1": { input: 0.015, output: 0.06 },
    "o1-mini": { input: 0.003, output: 0.012 },
    "o3": { input: 0.015, output: 0.06 },
    "o3-mini": { input: 0.003, output: 0.012 },
    // Anthropic models
    "claude-3-opus": { input: 0.015, output: 0.075 },
    "claude-3-sonnet": { input: 0.003, output: 0.015 },
    "claude-3-haiku": { input: 0.00025, output: 0.00125 },
    "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku": { input: 0.001, output: 0.005 },
    "claude-opus-4": { input: 0.015, output: 0.075 },
    "claude-sonnet-4": { input: 0.003, output: 0.015 },
    // Google models
    "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
    "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
    "gemini-2": { input: 0.00125, output: 0.005 },
    "gemini-3-pro": { input: 0.00125, output: 0.005 },
    "gemini-3-flash": { input: 0.000075, output: 0.0003 },
    // DeepSeek models
    "deepseek-v3": { input: 0.00014, output: 0.00028 },
    "deepseek-r1": { input: 0.00055, output: 0.00219 },
    // Moonshot/Kimi models (OpenRouter)
    "kimi-k2": { input: 0.0006, output: 0.0024 },
    "moonshot-v1": { input: 0.0006, output: 0.0024 },
    // Qwen models
    "qwen-2.5": { input: 0.0003, output: 0.0006 },
    "qwen-max": { input: 0.002, output: 0.006 },
    // Default for unknown models
    "default": { input: 0.001, output: 0.002 },
};
let MetricsService = class MetricsService {
    registry;
    // Agent metrics
    agentExecutionsTotal;
    agentExecutionDuration;
    agentSuccessRate;
    // LLM metrics
    llmCallsTotal;
    llmCallDuration;
    llmTokensTotal;
    llmCostTotal;
    // Redis metrics
    redisStreamLength;
    redisConsumerLag;
    // Database metrics
    dbQueryDuration;
    dbQueriesTotal;
    // Qdrant metrics
    qdrantOperationDuration;
    qdrantOperationsTotal;
    // User feedback metrics
    userFeedbackTotal;
    regenerationRequestsTotal;
    // LLM-as-a-Judge evaluation metrics
    evaluationScoreGauge;
    evaluationCallsTotal;
    evaluationDuration;
    constructor() {
        this.registry = new prom_client_1.Registry();
        // Collect default Node.js metrics (CPU, memory, event loop, etc.)
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
        // Initialize all custom metrics
        this.initializeAgentMetrics();
        this.initializeLLMMetrics();
        this.initializeRedisMetrics();
        this.initializeDatabaseMetrics();
        this.initializeQdrantMetrics();
        this.initializeUserFeedbackMetrics();
        this.initializeEvaluationMetrics();
        console.log("MetricsService initialized with Prometheus metrics");
    }
    initializeAgentMetrics() {
        this.agentExecutionsTotal = new prom_client_1.Counter({
            name: "manoe_agent_executions_total",
            help: "Total number of agent executions",
            labelNames: ["agent_name", "status", "error_type"],
            registers: [this.registry],
        });
        this.agentExecutionDuration = new prom_client_1.Histogram({
            name: "manoe_agent_execution_duration_seconds",
            help: "Agent execution duration in seconds",
            labelNames: ["agent_name"],
            buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120],
            registers: [this.registry],
        });
        this.agentSuccessRate = new prom_client_1.Gauge({
            name: "manoe_agent_success_rate",
            help: "Agent success rate (0-1)",
            labelNames: ["agent_name"],
            registers: [this.registry],
        });
    }
    initializeLLMMetrics() {
        this.llmCallsTotal = new prom_client_1.Counter({
            name: "manoe_llm_calls_total",
            help: "Total number of LLM API calls",
            labelNames: ["provider", "model", "agent_name", "status"],
            registers: [this.registry],
        });
        this.llmCallDuration = new prom_client_1.Histogram({
            name: "manoe_llm_call_duration_seconds",
            help: "LLM API call duration in seconds",
            labelNames: ["provider", "model", "agent_name"],
            buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120],
            registers: [this.registry],
        });
        this.llmTokensTotal = new prom_client_1.Counter({
            name: "manoe_llm_tokens_total",
            help: "Total tokens used in LLM calls",
            labelNames: ["provider", "model", "agent_name", "token_type"],
            registers: [this.registry],
        });
        this.llmCostTotal = new prom_client_1.Counter({
            name: "manoe_llm_cost_usd_total",
            help: "Total cost of LLM calls in USD",
            labelNames: ["provider", "model", "agent_name", "run_id"],
            registers: [this.registry],
        });
    }
    initializeRedisMetrics() {
        this.redisStreamLength = new prom_client_1.Gauge({
            name: "manoe_redis_stream_length",
            help: "Current length of Redis streams",
            labelNames: ["stream_key"],
            registers: [this.registry],
        });
        this.redisConsumerLag = new prom_client_1.Gauge({
            name: "manoe_redis_consumer_lag",
            help: "Redis consumer group lag (messages behind)",
            labelNames: ["stream_key", "consumer_group"],
            registers: [this.registry],
        });
    }
    initializeDatabaseMetrics() {
        this.dbQueryDuration = new prom_client_1.Histogram({
            name: "manoe_db_query_duration_seconds",
            help: "Database query duration in seconds",
            labelNames: ["operation", "table"],
            buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            registers: [this.registry],
        });
        this.dbQueriesTotal = new prom_client_1.Counter({
            name: "manoe_db_queries_total",
            help: "Total number of database queries",
            labelNames: ["operation", "table", "status"],
            registers: [this.registry],
        });
    }
    initializeQdrantMetrics() {
        this.qdrantOperationDuration = new prom_client_1.Histogram({
            name: "manoe_qdrant_operation_duration_seconds",
            help: "Qdrant operation duration in seconds",
            labelNames: ["operation", "collection"],
            buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
            registers: [this.registry],
        });
        this.qdrantOperationsTotal = new prom_client_1.Counter({
            name: "manoe_qdrant_operations_total",
            help: "Total number of Qdrant operations",
            labelNames: ["operation", "collection", "status"],
            registers: [this.registry],
        });
    }
    initializeUserFeedbackMetrics() {
        this.userFeedbackTotal = new prom_client_1.Counter({
            name: "manoe_user_feedback_total",
            help: "Total user feedback submissions",
            labelNames: ["feedback_type", "agent_name"],
            registers: [this.registry],
        });
        this.regenerationRequestsTotal = new prom_client_1.Counter({
            name: "manoe_regeneration_requests_total",
            help: "Total regeneration requests (implicit negative feedback)",
            labelNames: ["agent_name", "scene_number"],
            registers: [this.registry],
        });
    }
    initializeEvaluationMetrics() {
        this.evaluationScoreGauge = new prom_client_1.Gauge({
            name: "manoe_evaluation_score",
            help: "LLM-as-a-Judge evaluation scores (0-1)",
            labelNames: ["evaluation_type", "agent_name", "run_id"],
            registers: [this.registry],
        });
        this.evaluationCallsTotal = new prom_client_1.Counter({
            name: "manoe_evaluation_calls_total",
            help: "Total number of LLM-as-a-Judge evaluation calls",
            labelNames: ["evaluation_type", "agent_name", "status"],
            registers: [this.registry],
        });
        this.evaluationDuration = new prom_client_1.Histogram({
            name: "manoe_evaluation_duration_seconds",
            help: "LLM-as-a-Judge evaluation duration in seconds",
            labelNames: ["evaluation_type", "agent_name"],
            buckets: [0.5, 1, 2, 5, 10, 20, 30],
            registers: [this.registry],
        });
    }
    /**
     * Record agent execution result
     */
    recordAgentExecution(result) {
        const status = result.success ? "success" : "failure";
        const errorType = result.errorType || "none";
        this.agentExecutionsTotal.inc({
            agent_name: result.agentName,
            status,
            error_type: errorType,
        });
        this.agentExecutionDuration.observe({ agent_name: result.agentName }, result.durationMs / 1000);
    }
    /**
     * Update agent success rate gauge
     */
    updateAgentSuccessRate(agentName, rate) {
        this.agentSuccessRate.set({ agent_name: agentName }, rate);
    }
    /**
     * Record LLM call result with cost calculation
     */
    recordLLMCall(result) {
        const status = result.success ? "success" : "failure";
        const normalizedModel = this.normalizeModelName(result.model);
        this.llmCallsTotal.inc({
            provider: result.provider,
            model: normalizedModel,
            agent_name: result.agentName,
            status,
        });
        this.llmCallDuration.observe({
            provider: result.provider,
            model: normalizedModel,
            agent_name: result.agentName,
        }, result.durationMs / 1000);
        // Record token usage
        this.llmTokensTotal.inc({
            provider: result.provider,
            model: normalizedModel,
            agent_name: result.agentName,
            token_type: "prompt",
        }, result.promptTokens);
        this.llmTokensTotal.inc({
            provider: result.provider,
            model: normalizedModel,
            agent_name: result.agentName,
            token_type: "completion",
        }, result.completionTokens);
        // Calculate and record cost
        const cost = this.calculateCost(normalizedModel, result.promptTokens, result.completionTokens);
        this.llmCostTotal.inc({
            provider: result.provider,
            model: normalizedModel,
            agent_name: result.agentName,
            run_id: result.runId,
        }, cost);
    }
    /**
     * Calculate cost in USD for token usage
     */
    calculateCost(model, promptTokens, completionTokens) {
        const normalizedModel = this.normalizeModelName(model);
        const pricing = MODEL_PRICING[normalizedModel] || MODEL_PRICING["default"];
        const inputCost = (promptTokens / 1000) * pricing.input;
        const outputCost = (completionTokens / 1000) * pricing.output;
        return inputCost + outputCost;
    }
    /**
     * Normalize model name for consistent metrics labeling
     */
    normalizeModelName(model) {
        // Remove provider prefix if present (e.g., "anthropic/claude-3-5-haiku" -> "claude-3-5-haiku")
        const baseName = model.includes("/") ? model.split("/").pop() : model;
        // Remove date suffixes (e.g., "gpt-4o-2024-05-13" -> "gpt-4o")
        const withoutDate = baseName.replace(/-\d{4}-\d{2}-\d{2}$/, "");
        // Check for exact match first
        if (MODEL_PRICING[withoutDate]) {
            return withoutDate;
        }
        // Check prefix matches, longest first to avoid matching "gpt-4o" before "gpt-4o-mini"
        const sortedModels = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
        for (const knownModel of sortedModels) {
            if (withoutDate.startsWith(knownModel)) {
                return knownModel;
            }
        }
        return withoutDate;
    }
    /**
     * Record Redis stream metrics
     */
    recordRedisStreamMetrics(metrics) {
        this.redisStreamLength.set({ stream_key: metrics.streamKey }, metrics.length);
        if (metrics.consumerLag !== undefined) {
            this.redisConsumerLag.set({ stream_key: metrics.streamKey, consumer_group: "manoe-consumers" }, metrics.consumerLag);
        }
    }
    /**
     * Record database query metrics
     */
    recordDatabaseQuery(metrics) {
        const status = metrics.success ? "success" : "failure";
        this.dbQueriesTotal.inc({
            operation: metrics.operation,
            table: metrics.table,
            status,
        });
        this.dbQueryDuration.observe({ operation: metrics.operation, table: metrics.table }, metrics.durationMs / 1000);
    }
    /**
     * Record Qdrant operation metrics
     */
    recordQdrantOperation(metrics) {
        const status = metrics.success ? "success" : "failure";
        this.qdrantOperationsTotal.inc({
            operation: metrics.operation,
            collection: metrics.collection,
            status,
        });
        this.qdrantOperationDuration.observe({ operation: metrics.operation, collection: metrics.collection }, metrics.durationMs / 1000);
    }
    /**
     * Record user feedback
     */
    recordUserFeedback(feedbackType, agentName) {
        this.userFeedbackTotal.inc({
            feedback_type: feedbackType,
            agent_name: agentName,
        });
    }
    /**
     * Record regeneration request (implicit negative feedback)
     */
    recordRegenerationRequest(agentName, sceneNumber) {
        this.regenerationRequestsTotal.inc({
            agent_name: agentName,
            scene_number: sceneNumber?.toString() || "n/a",
        });
    }
    /**
     * Record LLM-as-a-Judge evaluation result
     */
    recordEvaluation(evaluationType, agentName, runId, score, durationMs, success) {
        const status = success ? "success" : "failure";
        this.evaluationCallsTotal.inc({
            evaluation_type: evaluationType,
            agent_name: agentName,
            status,
        });
        if (success) {
            this.evaluationScoreGauge.set({
                evaluation_type: evaluationType,
                agent_name: agentName,
                run_id: runId,
            }, score);
        }
        this.evaluationDuration.observe({
            evaluation_type: evaluationType,
            agent_name: agentName,
        }, durationMs / 1000);
    }
    /**
     * Get Prometheus metrics in text format
     */
    async getMetrics() {
        return await this.registry.metrics();
    }
    /**
     * Get metrics content type for HTTP response
     */
    getContentType() {
        return this.registry.contentType;
    }
    /**
     * Get the registry for custom metric registration
     */
    getRegistry() {
        return this.registry;
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, di_1.Service)(),
    __metadata("design:paramtypes", [])
], MetricsService);
//# sourceMappingURL=MetricsService.js.map