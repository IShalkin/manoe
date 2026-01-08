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
import { Registry } from "prom-client";
/**
 * Agent execution result for metrics
 */
export interface AgentExecutionResult {
    agentName: string;
    runId: string;
    projectId: string;
    success: boolean;
    durationMs: number;
    errorType?: string;
    errorMessage?: string;
}
/**
 * LLM call result for metrics
 */
export interface LLMCallResult {
    provider: string;
    model: string;
    runId: string;
    agentName: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    success: boolean;
    errorType?: string;
}
/**
 * Redis stream metrics
 */
export interface RedisStreamMetrics {
    streamKey: string;
    length: number;
    consumerLag?: number;
}
/**
 * Database query metrics
 */
export interface DatabaseQueryMetrics {
    operation: string;
    table: string;
    durationMs: number;
    success: boolean;
}
/**
 * Qdrant operation metrics
 */
export interface QdrantOperationMetrics {
    operation: string;
    collection: string;
    durationMs: number;
    success: boolean;
    resultCount?: number;
}
export declare class MetricsService {
    private registry;
    private agentExecutionsTotal;
    private agentExecutionDuration;
    private agentSuccessRate;
    private llmCallsTotal;
    private llmCallDuration;
    private llmTokensTotal;
    private llmCostTotal;
    private redisStreamLength;
    private redisConsumerLag;
    private dbQueryDuration;
    private dbQueriesTotal;
    private qdrantOperationDuration;
    private qdrantOperationsTotal;
    private userFeedbackTotal;
    private regenerationRequestsTotal;
    private evaluationScoreGauge;
    private evaluationCallsTotal;
    private evaluationDuration;
    constructor();
    private initializeAgentMetrics;
    private initializeLLMMetrics;
    private initializeRedisMetrics;
    private initializeDatabaseMetrics;
    private initializeQdrantMetrics;
    private initializeUserFeedbackMetrics;
    private initializeEvaluationMetrics;
    /**
     * Record agent execution result
     */
    recordAgentExecution(result: AgentExecutionResult): void;
    /**
     * Update agent success rate gauge
     */
    updateAgentSuccessRate(agentName: string, rate: number): void;
    /**
     * Record LLM call result with cost calculation
     */
    recordLLMCall(result: LLMCallResult): void;
    /**
     * Calculate cost in USD for token usage
     */
    calculateCost(model: string, promptTokens: number, completionTokens: number): number;
    /**
     * Normalize model name for consistent metrics labeling
     */
    private normalizeModelName;
    /**
     * Record Redis stream metrics
     */
    recordRedisStreamMetrics(metrics: RedisStreamMetrics): void;
    /**
     * Record database query metrics
     */
    recordDatabaseQuery(metrics: DatabaseQueryMetrics): void;
    /**
     * Record Qdrant operation metrics
     */
    recordQdrantOperation(metrics: QdrantOperationMetrics): void;
    /**
     * Record user feedback
     */
    recordUserFeedback(feedbackType: "thumbs_up" | "thumbs_down", agentName: string): void;
    /**
     * Record regeneration request (implicit negative feedback)
     */
    recordRegenerationRequest(agentName: string, sceneNumber?: number): void;
    /**
     * Record LLM-as-a-Judge evaluation result
     */
    recordEvaluation(evaluationType: "faithfulness" | "relevance", agentName: string, runId: string, score: number, durationMs: number, success: boolean): void;
    /**
     * Get Prometheus metrics in text format
     */
    getMetrics(): Promise<string>;
    /**
     * Get metrics content type for HTTP response
     */
    getContentType(): string;
    /**
     * Get the registry for custom metric registration
     */
    getRegistry(): Registry;
}
//# sourceMappingURL=MetricsService.d.ts.map