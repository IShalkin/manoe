/**
 * Langfuse Service for MANOE
 * Provides LLM observability with tracing and Prompt Management
 * 
 * Features:
 * - Automatic tracing of all LLM calls
 * - Prompt Management - fetch prompts from Langfuse dashboard
 * - Generation tracking with metadata
 * - Cost tracking and latency monitoring
 * - Span-based tracing for complex workflows
 */

import { Service } from "@tsed/di";
import { Langfuse } from "langfuse";
import { LLMProvider, LLMResponse, GenerationPhase } from "../models/LLMModels";

/**
 * Trace metadata
 */
export interface TraceMetadata {
  projectId: string;
  runId: string;
  phase: GenerationPhase;
  agentName?: string;
  userId?: string;
}

/**
 * Generation metadata for tracking
 */
export interface GenerationMetadata {
  traceId: string;
  spanId?: string;
  name: string;
  model: string;
  provider: LLMProvider;
  input: unknown;
  output?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Prompt template from Langfuse
 */
export interface PromptTemplate {
  name: string;
  version: number;
  prompt: string;
  config?: Record<string, unknown>;
  labels?: string[];
}

/**
 * Active trace context
 */
interface TraceContext {
  traceId: string;
  trace: ReturnType<Langfuse["trace"]>;
  spans: Map<string, ReturnType<ReturnType<Langfuse["trace"]>["span"]>>;
}

@Service()
export class LangfuseService {
  private client: Langfuse | null = null;
  private activeTraces: Map<string, TraceContext> = new Map();
  private promptCache: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Langfuse client
   */
  private initialize(): void {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_HOST || "https://langfuse.iliashalkin.com";

    if (!publicKey || !secretKey) {
      console.warn("Langfuse: Missing API keys, tracing disabled");
      return;
    }

    this.client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });

    console.log(`Langfuse connected to ${baseUrl}`);
  }

  /**
   * Check if Langfuse is enabled
   */
  get isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Start a new trace for a generation run
   * 
   * @param metadata - Trace metadata including projectId, runId, phase
   * @returns Trace ID
   */
  startTrace(metadata: TraceMetadata): string {
    if (!this.client) return metadata.runId;

    const trace = this.client.trace({
      id: metadata.runId,
      name: `MANOE Generation - ${metadata.phase}`,
      metadata: {
        projectId: metadata.projectId,
        phase: metadata.phase,
        agentName: metadata.agentName,
      },
      userId: metadata.userId,
      tags: ["manoe", metadata.phase],
    });

    this.activeTraces.set(metadata.runId, {
      traceId: metadata.runId,
      trace,
      spans: new Map(),
    });

    return metadata.runId;
  }

  /**
   * Start a span within a trace (for nested operations)
   * 
   * @param runId - The run/trace ID
   * @param spanName - Name of the span
   * @param metadata - Additional metadata
   * @returns Span ID
   */
  startSpan(
    runId: string,
    spanName: string,
    metadata?: Record<string, unknown>
  ): string {
    const context = this.activeTraces.get(runId);
    if (!context) return `${runId}-${spanName}`;

    const spanId = `${runId}-${spanName}-${Date.now()}`;
    const span = context.trace.span({
      name: spanName,
      metadata,
    });

    context.spans.set(spanId, span);
    return spanId;
  }

  /**
   * End a span
   * 
   * @param runId - The run/trace ID
   * @param spanId - The span ID to end
   * @param output - Output data
   */
  endSpan(
    runId: string,
    spanId: string,
    output?: Record<string, unknown>
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    const span = context.spans.get(spanId);
    if (span) {
      span.end({ output });
      context.spans.delete(spanId);
    }
  }

  /**
   * Track an LLM generation
   * 
   * @param metadata - Generation metadata
   */
  trackGeneration(metadata: GenerationMetadata): void {
    const context = this.activeTraces.get(metadata.traceId);
    if (!context) return;

    const parent = metadata.spanId 
      ? context.spans.get(metadata.spanId) 
      : context.trace;

    if (!parent) return;

    parent.generation({
      name: metadata.name,
      model: metadata.model,
      modelParameters: {
        provider: metadata.provider,
      },
      input: metadata.input,
      output: metadata.output,
      usage: metadata.usage ? {
        promptTokens: metadata.usage.promptTokens,
        completionTokens: metadata.usage.completionTokens,
        totalTokens: metadata.usage.totalTokens,
      } : undefined,
      metadata: {
        ...metadata.metadata,
        latencyMs: metadata.latencyMs,
      },
    });
  }

  /**
   * Track an LLM response (convenience method)
   * 
   * @param runId - The run/trace ID
   * @param agentName - Name of the agent making the call
   * @param input - Input messages/prompt
   * @param response - LLM response
   * @param spanId - Optional parent span ID
   */
  trackLLMCall(
    runId: string,
    agentName: string,
    input: unknown,
    response: LLMResponse,
    spanId?: string
  ): void {
    this.trackGeneration({
      traceId: runId,
      spanId,
      name: `${agentName} - ${response.model}`,
      model: response.model,
      provider: response.provider,
      input,
      output: response.content,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
      latencyMs: response.latencyMs,
    });
  }

  /**
   * End a trace
   * 
   * @param runId - The run/trace ID
   * @param output - Final output data
   */
  endTrace(runId: string, output?: Record<string, unknown>): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    // End all remaining spans
    for (const [spanId, span] of context.spans) {
      span.end();
    }

    // Update trace with final output
    context.trace.update({
      output,
    });

    this.activeTraces.delete(runId);
  }

  /**
   * Add an event to a trace
   * 
   * @param runId - The run/trace ID
   * @param eventName - Name of the event
   * @param metadata - Event metadata
   */
  addEvent(
    runId: string,
    eventName: string,
    metadata?: Record<string, unknown>
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    context.trace.event({
      name: eventName,
      metadata,
    });
  }

  /**
   * Score a trace (for quality evaluation)
   * 
   * @param runId - The run/trace ID
   * @param name - Score name (e.g., "quality", "coherence")
   * @param value - Score value (0-1)
   * @param comment - Optional comment
   */
  scoreTrace(
    runId: string,
    name: string,
    value: number,
    comment?: string
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    context.trace.score({
      name,
      value,
      comment,
    });
  }

  // ==================== PROMPT MANAGEMENT ====================

  /**
   * Get a prompt from Langfuse Prompt Management
   * 
   * @param promptName - Name of the prompt in Langfuse
   * @param version - Optional specific version (defaults to latest production)
   * @param useCache - Whether to use cached prompt (default: true)
   * @returns Prompt template or null if not found
   */
  async getPrompt(
    promptName: string,
    version?: number,
    useCache: boolean = true
  ): Promise<PromptTemplate | null> {
    if (!this.client) {
      console.warn(`Langfuse: Cannot fetch prompt "${promptName}" - client not initialized`);
      return null;
    }

    const cacheKey = version ? `${promptName}:${version}` : promptName;

    // Check cache first
    if (useCache && this.promptCache.has(cacheKey)) {
      return this.promptCache.get(cacheKey)!;
    }

    try {
      const prompt = await this.client.getPrompt(promptName, version);
      
      if (!prompt) {
        console.warn(`Langfuse: Prompt "${promptName}" not found`);
        return null;
      }

      const template: PromptTemplate = {
        name: promptName,
        version: prompt.version,
        prompt: prompt.prompt,
        config: prompt.config as Record<string, unknown> | undefined,
        labels: prompt.labels,
      };

      // Cache the prompt
      this.promptCache.set(cacheKey, template);

      return template;
    } catch (error) {
      console.error(`Langfuse: Error fetching prompt "${promptName}":`, error);
      return null;
    }
  }

  /**
   * Compile a prompt template with variables
   * 
   * @param template - Prompt template string with {{variable}} placeholders
   * @param variables - Variables to substitute
   * @returns Compiled prompt string
   */
  compilePrompt(
    template: string,
    variables: Record<string, string>
  ): string {
    let compiled = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      compiled = compiled.replace(placeholder, value);
    }

    return compiled;
  }

  /**
   * Get and compile a prompt in one call
   * 
   * @param promptName - Name of the prompt in Langfuse
   * @param variables - Variables to substitute
   * @param fallback - Fallback prompt if Langfuse fetch fails
   * @returns Compiled prompt string
   */
  async getCompiledPrompt(
    promptName: string,
    variables: Record<string, string>,
    fallback?: string
  ): Promise<string> {
    const template = await this.getPrompt(promptName);

    if (!template) {
      if (fallback) {
        return this.compilePrompt(fallback, variables);
      }
      throw new Error(`Prompt "${promptName}" not found and no fallback provided`);
    }

    return this.compilePrompt(template.prompt, variables);
  }

  /**
   * Clear prompt cache
   */
  clearPromptCache(): void {
    this.promptCache.clear();
  }

  /**
   * Flush all pending events to Langfuse
   */
  async flush(): Promise<void> {
    if (this.client) {
      await this.client.flushAsync();
    }
  }

  /**
   * Shutdown Langfuse client
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdownAsync();
      this.client = null;
    }
  }
}

/**
 * Agent prompt names in Langfuse
 * These should match the prompts configured in Langfuse dashboard
 */
export const AGENT_PROMPTS = {
  ARCHITECT: "manoe-architect",
  PROFILER: "manoe-profiler",
  WORLDBUILDER: "manoe-worldbuilder",
  STRATEGIST: "manoe-strategist",
  WRITER: "manoe-writer",
  CRITIC: "manoe-critic",
  ORIGINALITY: "manoe-originality",
  IMPACT: "manoe-impact",
  ARCHIVIST: "manoe-archivist",
} as const;

/**
 * Phase prompt names in Langfuse
 */
export const PHASE_PROMPTS = {
  GENESIS: "manoe-phase-genesis",
  CHARACTERS: "manoe-phase-characters",
  NARRATOR_DESIGN: "manoe-phase-narrator-design",
  WORLDBUILDING: "manoe-phase-worldbuilding",
  OUTLINING: "manoe-phase-outlining",
  ADVANCED_PLANNING: "manoe-phase-advanced-planning",
  DRAFTING: "manoe-phase-drafting",
  CRITIQUE: "manoe-phase-critique",
  REVISION: "manoe-phase-revision",
  ORIGINALITY_CHECK: "manoe-phase-originality-check",
  IMPACT_ASSESSMENT: "manoe-phase-impact-assessment",
  POLISH: "manoe-phase-polish",
} as const;
