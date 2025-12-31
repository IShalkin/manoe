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

import { Service } from "@tsed/di";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Model pricing in USD per 1K tokens
 * Updated pricing as of 2024
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
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
  // Default for unknown models
  "default": { input: 0.001, output: 0.002 },
};

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

@Service()
export class MetricsService {
  private registry: Registry;
  
  // Agent metrics
  private agentExecutionsTotal: Counter;
  private agentExecutionDuration: Histogram;
  private agentSuccessRate: Gauge;
  
  // LLM metrics
  private llmCallsTotal: Counter;
  private llmCallDuration: Histogram;
  private llmTokensTotal: Counter;
  private llmCostTotal: Counter;
  
  // Redis metrics
  private redisStreamLength: Gauge;
  private redisConsumerLag: Gauge;
  
  // Database metrics
  private dbQueryDuration: Histogram;
  private dbQueriesTotal: Counter;
  
  // Qdrant metrics
  private qdrantOperationDuration: Histogram;
  private qdrantOperationsTotal: Counter;
  
  // User feedback metrics
  private userFeedbackTotal: Counter;
  private regenerationRequestsTotal: Counter;

  constructor() {
    this.registry = new Registry();
    
    // Collect default Node.js metrics (CPU, memory, event loop, etc.)
    collectDefaultMetrics({ register: this.registry });
    
    // Initialize all custom metrics
    this.initializeAgentMetrics();
    this.initializeLLMMetrics();
    this.initializeRedisMetrics();
    this.initializeDatabaseMetrics();
    this.initializeQdrantMetrics();
    this.initializeUserFeedbackMetrics();
    
    console.log("MetricsService initialized with Prometheus metrics");
  }

  private initializeAgentMetrics(): void {
    this.agentExecutionsTotal = new Counter({
      name: "manoe_agent_executions_total",
      help: "Total number of agent executions",
      labelNames: ["agent_name", "status", "error_type"],
      registers: [this.registry],
    });

    this.agentExecutionDuration = new Histogram({
      name: "manoe_agent_execution_duration_seconds",
      help: "Agent execution duration in seconds",
      labelNames: ["agent_name"],
      buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120],
      registers: [this.registry],
    });

    this.agentSuccessRate = new Gauge({
      name: "manoe_agent_success_rate",
      help: "Agent success rate (0-1)",
      labelNames: ["agent_name"],
      registers: [this.registry],
    });
  }

  private initializeLLMMetrics(): void {
    this.llmCallsTotal = new Counter({
      name: "manoe_llm_calls_total",
      help: "Total number of LLM API calls",
      labelNames: ["provider", "model", "agent_name", "status"],
      registers: [this.registry],
    });

    this.llmCallDuration = new Histogram({
      name: "manoe_llm_call_duration_seconds",
      help: "LLM API call duration in seconds",
      labelNames: ["provider", "model", "agent_name"],
      buckets: [0.5, 1, 2, 5, 10, 20, 30, 45, 60, 90, 120],
      registers: [this.registry],
    });

    this.llmTokensTotal = new Counter({
      name: "manoe_llm_tokens_total",
      help: "Total tokens used in LLM calls",
      labelNames: ["provider", "model", "agent_name", "token_type"],
      registers: [this.registry],
    });

    this.llmCostTotal = new Counter({
      name: "manoe_llm_cost_usd_total",
      help: "Total cost of LLM calls in USD",
      labelNames: ["provider", "model", "agent_name", "run_id"],
      registers: [this.registry],
    });
  }

  private initializeRedisMetrics(): void {
    this.redisStreamLength = new Gauge({
      name: "manoe_redis_stream_length",
      help: "Current length of Redis streams",
      labelNames: ["stream_key"],
      registers: [this.registry],
    });

    this.redisConsumerLag = new Gauge({
      name: "manoe_redis_consumer_lag",
      help: "Redis consumer group lag (messages behind)",
      labelNames: ["stream_key", "consumer_group"],
      registers: [this.registry],
    });
  }

  private initializeDatabaseMetrics(): void {
    this.dbQueryDuration = new Histogram({
      name: "manoe_db_query_duration_seconds",
      help: "Database query duration in seconds",
      labelNames: ["operation", "table"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.dbQueriesTotal = new Counter({
      name: "manoe_db_queries_total",
      help: "Total number of database queries",
      labelNames: ["operation", "table", "status"],
      registers: [this.registry],
    });
  }

  private initializeQdrantMetrics(): void {
    this.qdrantOperationDuration = new Histogram({
      name: "manoe_qdrant_operation_duration_seconds",
      help: "Qdrant operation duration in seconds",
      labelNames: ["operation", "collection"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.qdrantOperationsTotal = new Counter({
      name: "manoe_qdrant_operations_total",
      help: "Total number of Qdrant operations",
      labelNames: ["operation", "collection", "status"],
      registers: [this.registry],
    });
  }

  private initializeUserFeedbackMetrics(): void {
    this.userFeedbackTotal = new Counter({
      name: "manoe_user_feedback_total",
      help: "Total user feedback submissions",
      labelNames: ["feedback_type", "agent_name", "rating"],
      registers: [this.registry],
    });

    this.regenerationRequestsTotal = new Counter({
      name: "manoe_regeneration_requests_total",
      help: "Total regeneration requests (implicit negative feedback)",
      labelNames: ["agent_name", "scene_number"],
      registers: [this.registry],
    });
  }

  /**
   * Record agent execution result
   */
  recordAgentExecution(result: AgentExecutionResult): void {
    const status = result.success ? "success" : "failure";
    const errorType = result.errorType || "none";

    this.agentExecutionsTotal.inc({
      agent_name: result.agentName,
      status,
      error_type: errorType,
    });

    this.agentExecutionDuration.observe(
      { agent_name: result.agentName },
      result.durationMs / 1000
    );
  }

  /**
   * Update agent success rate gauge
   */
  updateAgentSuccessRate(agentName: string, rate: number): void {
    this.agentSuccessRate.set({ agent_name: agentName }, rate);
  }

  /**
   * Record LLM call result with cost calculation
   */
  recordLLMCall(result: LLMCallResult): void {
    const status = result.success ? "success" : "failure";
    const normalizedModel = this.normalizeModelName(result.model);

    this.llmCallsTotal.inc({
      provider: result.provider,
      model: normalizedModel,
      agent_name: result.agentName,
      status,
    });

    this.llmCallDuration.observe(
      {
        provider: result.provider,
        model: normalizedModel,
        agent_name: result.agentName,
      },
      result.durationMs / 1000
    );

    // Record token usage
    this.llmTokensTotal.inc(
      {
        provider: result.provider,
        model: normalizedModel,
        agent_name: result.agentName,
        token_type: "prompt",
      },
      result.promptTokens
    );

    this.llmTokensTotal.inc(
      {
        provider: result.provider,
        model: normalizedModel,
        agent_name: result.agentName,
        token_type: "completion",
      },
      result.completionTokens
    );

    // Calculate and record cost
    const cost = this.calculateCost(
      normalizedModel,
      result.promptTokens,
      result.completionTokens
    );

    this.llmCostTotal.inc(
      {
        provider: result.provider,
        model: normalizedModel,
        agent_name: result.agentName,
        run_id: result.runId,
      },
      cost
    );
  }

  /**
   * Calculate cost in USD for token usage
   */
  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const normalizedModel = this.normalizeModelName(model);
    const pricing = MODEL_PRICING[normalizedModel] || MODEL_PRICING["default"];
    
    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Normalize model name for consistent metrics labeling
   */
  private normalizeModelName(model: string): string {
    // Remove provider prefix if present (e.g., "anthropic/claude-3-5-haiku" -> "claude-3-5-haiku")
    const baseName = model.includes("/") ? model.split("/").pop()! : model;
    
    // Remove date suffixes (e.g., "gpt-4o-2024-05-13" -> "gpt-4o")
    const withoutDate = baseName.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    
    // Check if we have pricing for this model
    for (const knownModel of Object.keys(MODEL_PRICING)) {
      if (withoutDate.startsWith(knownModel)) {
        return knownModel;
      }
    }
    
    return withoutDate;
  }

  /**
   * Record Redis stream metrics
   */
  recordRedisStreamMetrics(metrics: RedisStreamMetrics): void {
    this.redisStreamLength.set({ stream_key: metrics.streamKey }, metrics.length);
    
    if (metrics.consumerLag !== undefined) {
      this.redisConsumerLag.set(
        { stream_key: metrics.streamKey, consumer_group: "manoe-consumers" },
        metrics.consumerLag
      );
    }
  }

  /**
   * Record database query metrics
   */
  recordDatabaseQuery(metrics: DatabaseQueryMetrics): void {
    const status = metrics.success ? "success" : "failure";

    this.dbQueriesTotal.inc({
      operation: metrics.operation,
      table: metrics.table,
      status,
    });

    this.dbQueryDuration.observe(
      { operation: metrics.operation, table: metrics.table },
      metrics.durationMs / 1000
    );
  }

  /**
   * Record Qdrant operation metrics
   */
  recordQdrantOperation(metrics: QdrantOperationMetrics): void {
    const status = metrics.success ? "success" : "failure";

    this.qdrantOperationsTotal.inc({
      operation: metrics.operation,
      collection: metrics.collection,
      status,
    });

    this.qdrantOperationDuration.observe(
      { operation: metrics.operation, collection: metrics.collection },
      metrics.durationMs / 1000
    );
  }

  /**
   * Record user feedback
   */
  recordUserFeedback(
    feedbackType: "thumbs_up" | "thumbs_down",
    agentName: string,
    rating: number
  ): void {
    this.userFeedbackTotal.inc({
      feedback_type: feedbackType,
      agent_name: agentName,
      rating: rating.toString(),
    });
  }

  /**
   * Record regeneration request (implicit negative feedback)
   */
  recordRegenerationRequest(agentName: string, sceneNumber?: number): void {
    this.regenerationRequestsTotal.inc({
      agent_name: agentName,
      scene_number: sceneNumber?.toString() || "n/a",
    });
  }

  /**
   * Get Prometheus metrics in text format
   */
  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  /**
   * Get metrics content type for HTTP response
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Get the registry for custom metric registration
   */
  getRegistry(): Registry {
    return this.registry;
  }
}
