/**
 * Qdrant Memory Service for MANOE
 * Provides vector memory storage for characters, worldbuilding, and scenes
 * 
 * Features:
 * - Character profile storage and semantic search
 * - Worldbuilding element storage (geography, cultures, rules)
 * - Scene storage for continuity
 * - Multiple embedding provider support (OpenAI, Gemini, local)
 */

import { Service, Inject } from "@tsed/di";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { stringifyForPrompt } from "../utils/schemaNormalizers";
import { MetricsService } from "./MetricsService";

/**
 * Embedding provider types
 */
export enum EmbeddingProvider {
  OPENAI = "openai",
  GEMINI = "gemini",
  LOCAL = "local",
}

/**
 * Embedding provider info
 */
export interface EmbeddingProviderInfo {
  providerType: EmbeddingProvider;
  modelName: string;
  dimension: number;
}

/**
 * Search result structure
 */
export interface SearchResult<T> {
  id: string;
  score: number;
  payload: T;
}

/**
 * Character payload
 */
export interface CharacterPayload {
  projectId: string;
  character: Record<string, unknown>;
  name: string;
  createdAt: string;
  qdrantPointId?: string;
  [key: string]: unknown;
}

/**
 * Worldbuilding payload
 */
export interface WorldbuildingPayload {
  projectId: string;
  elementType: string;
  element: Record<string, unknown>;
  createdAt: string;
  qdrantPointId?: string;
  [key: string]: unknown;
}

/**
 * Scene payload
 */
export interface ScenePayload {
  projectId: string;
  sceneNumber: number;
  scene: Record<string, unknown>;
  createdAt: string;
  qdrantPointId?: string;
  [key: string]: unknown;
}

@Service()
export class QdrantMemoryService {
  private client: QdrantClient | null = null;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private embeddingProvider: EmbeddingProvider = EmbeddingProvider.LOCAL;
  private embeddingDimension: number = 3072; // Default to 3072 for collection naming consistency
  private embeddingModel: string = "none";
  private isConnected: boolean = false;

  // Track current API keys to detect changes (fixes singleton caching issue)
  private currentGeminiKey?: string;
  private currentOpenaiKey?: string;

  @Inject()
  private metricsService!: MetricsService;

  // Collection name prefixes (versioned with dimension suffix)
  private readonly COLLECTION_PREFIX_CHARACTERS = "manoe_characters";
  private readonly COLLECTION_PREFIX_WORLDBUILDING = "manoe_worldbuilding";
  private readonly COLLECTION_PREFIX_SCENES = "manoe_scenes";

  // Versioned collection names (set after embedding provider is determined)
  private collectionCharacters: string = "";
  private collectionWorldbuilding: string = "";
  private collectionScenes: string = "";

  /**
   * Connect to Qdrant and initialize embedding provider
   * 
   * Supports re-initialization when API keys change (fixes singleton caching issue).
   * 
   * @param openaiApiKey - OpenAI API key for embeddings (highest priority)
   * @param geminiApiKey - Gemini API key for embeddings (second priority)
   * @param preferLocal - If true, use local embeddings even if API keys available
   */
  async connect(
    openaiApiKey?: string,
    geminiApiKey?: string,
    preferLocal: boolean = false
  ): Promise<void> {
    // Detect if API keys have changed - need to reinitialize if so
    // Compare without truthy check to detect both additions AND removals of keys
    const geminiKeyChanged = geminiApiKey !== this.currentGeminiKey;
    const openaiKeyChanged = openaiApiKey !== this.currentOpenaiKey;
    const keyChanged = geminiKeyChanged || openaiKeyChanged;

    // Skip if already connected with same keys
    if (this.isConnected && !keyChanged) {
      return;
    }

    if (keyChanged) {
      console.log("Qdrant Memory: API key changed, reinitializing embedding provider");
    }

    // Update tracked keys
    this.currentGeminiKey = geminiApiKey;
    this.currentOpenaiKey = openaiApiKey;

    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    this.client = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    // Initialize embedding provider
    if (!preferLocal && openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
      this.embeddingProvider = EmbeddingProvider.OPENAI;
      this.embeddingDimension = 1536;
      this.embeddingModel = "text-embedding-3-small";
      console.log("Qdrant Memory: Using OpenAI embeddings (1536 dimensions)");
    } else if (!preferLocal && geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
      this.embeddingProvider = EmbeddingProvider.GEMINI;
      this.embeddingDimension = 3072; // gemini-embedding-001 outputs 3072 dimensions
      this.embeddingModel = "gemini-embedding-001";
      console.log("Qdrant Memory: Using Gemini gemini-embedding-001 (3072 dimensions)");
    } else {
      this.embeddingProvider = EmbeddingProvider.LOCAL;
      this.embeddingDimension = 3072; // Use 3072 for collection naming consistency with Gemini
      this.embeddingModel = "none";
      console.log("Qdrant Memory: Using local embeddings (3072 dimensions for consistency)");
    }

    // Set versioned collection names based on embedding dimension
    // This prevents data loss when switching embedding providers
    this.collectionCharacters = `${this.COLLECTION_PREFIX_CHARACTERS}_v1_${this.embeddingDimension}`;
    this.collectionWorldbuilding = `${this.COLLECTION_PREFIX_WORLDBUILDING}_v1_${this.embeddingDimension}`;
    this.collectionScenes = `${this.COLLECTION_PREFIX_SCENES}_v1_${this.embeddingDimension}`;

    console.log(`Qdrant Memory: Using versioned collections with ${this.embeddingDimension} dimensions`);

    // Ensure collections exist
    await this.ensureCollections();

    this.isConnected = true;
    console.log(`Qdrant Memory connected to ${qdrantUrl}`);
  }

  /**
   * Get embedding provider info
   */
  get providerInfo(): EmbeddingProviderInfo {
    return {
      providerType: this.embeddingProvider,
      modelName: this.embeddingModel,
      dimension: this.embeddingDimension,
    };
  }

  /**
   * Ensure all required collections exist with correct dimensions
   * Uses versioned collection names to prevent data loss when switching embedding providers
   * Old collections are preserved for potential migration
   */
  private async ensureCollections(): Promise<void> {
    if (!this.client) return;

    // Use versioned collection names (already set based on embedding dimension)
    const collections = [
      this.collectionCharacters,
      this.collectionWorldbuilding,
      this.collectionScenes,
    ];

    for (const collectionName of collections) {
      try {
        // Check if versioned collection already exists
        await this.client.getCollection(collectionName);
        console.log(`Qdrant collection ${collectionName} exists with correct dimensions (${this.embeddingDimension})`);
      } catch (error) {
        // Collection doesn't exist, create it with correct dimensions
        // Note: We never delete existing collections - old versioned collections are preserved
        await this.client.createCollection(collectionName, {
          vectors: {
            size: this.embeddingDimension,
            distance: "Cosine",
          },
        });
        console.log(`Created Qdrant collection: ${collectionName} with ${this.embeddingDimension} dimensions`);
      }
    }
  }

  // One-time warning flag so LOCAL-mode degradation is loud but not spammy
  private static localWarningEmitted = false;
  private static localSearchWarningEmitted = false;

  /**
   * Deterministic pseudo-embedding derived from text.
   *
   * NOT semantic — this only guarantees that identical text maps to an
   * identical vector, so cosine ranking in LOCAL mode is stable and
   * repeatable instead of random garbage. Real semantic search requires an
   * OpenAI or Gemini key (or a real local embedding model).
   *
   * Uses an FNV-1a hash of the text to seed a per-dimension xorshift PRNG,
   * yielding finite values in roughly [-0.5, 0.5] (same range as the old
   * Math.random implementation).
   */
  static localEmbedding(text: string, dim: number): number[] {
    // FNV-1a 32-bit hash of the input text.
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // Seed must be non-zero for xorshift; mix in the dimension index per element.
    let state = (hash >>> 0) || 0x1;

    const vector = new Array<number>(dim);
    for (let i = 0; i < dim; i++) {
      // xorshift32 step, perturbed by the index so successive dims differ.
      state ^= (i + 1);
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      // Map to [-0.5, 0.5).
      vector[i] = state / 0xffffffff - 0.5;
    }
    return vector;
  }

  /**
   * Extract the embedding vector from an OpenAI embeddings response, guarding
   * against empty/missing `data` (empty input or content-filtered response
   * yields `data: []`, so `data[0]` would be undefined and crash the caller).
   *
   * Throws a clear, catchable error rather than dereferencing undefined.
   */
  static extractEmbedding(
    response: { data?: Array<{ embedding?: number[] }> },
    dim: number
  ): number[] {
    const embedding = response?.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error(
        `OpenAI embeddings returned empty data (expected ${dim}-dim vector); ` +
          `likely empty input or a content-filtered response`
      );
    }
    return embedding;
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Guard empty input: never call the embedding API with "" (yields data: [])
    // and never store a meaningless vector. Fall back to a deterministic local
    // vector so the store/search path stays alive without a crash.
    if (!text || text.trim().length === 0) {
      return QdrantMemoryService.localEmbedding(text ?? "", this.embeddingDimension);
    }

    if (this.embeddingProvider === EmbeddingProvider.OPENAI && this.openaiClient) {
      const response = await this.openaiClient.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      return QdrantMemoryService.extractEmbedding(response, this.embeddingDimension);
    } else if (this.embeddingProvider === EmbeddingProvider.GEMINI && this.geminiClient) {
      try {
        // Use full model path format "models/gemini-embedding-001" for Gemini API
        const modelPath = this.embeddingModel.startsWith("models/")
          ? this.embeddingModel
          : `models/${this.embeddingModel}`;
        const model = this.geminiClient.getGenerativeModel({ model: modelPath });
        // Use simple text format for embedContent (embedding models support string input)
        const result = await model.embedContent(text);
        return result.embedding.values;
      } catch (error) {
        const errorDetails = error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack?.split('\n')[0] }
          : error;
        console.error(`Qdrant Memory: Gemini embedContent failed - model: ${this.embeddingModel}, textLength: ${text.length}, error:`, errorDetails);
        throw error;
      }
    } else {
      // Local embeddings: deterministic pseudo-vector derived from the text.
      // This is NOT semantic search — identical text gets identical vectors so
      // ranking is stable/repeatable, but relevance is meaningless. Warn loudly
      // once so this degraded mode is never silent.
      if (!QdrantMemoryService.localWarningEmitted) {
        QdrantMemoryService.localWarningEmitted = true;
        console.warn(
          "Qdrant Memory: LOCAL embedding mode is active — semantic search is " +
            "DEGRADED (deterministic pseudo-vectors, not real embeddings). " +
            "Set an OpenAI or Gemini API key for meaningful retrieval."
        );
      }
      return QdrantMemoryService.localEmbedding(text, this.embeddingDimension);
    }
  }

  /**
   * Store a character in Qdrant
   */
  async storeCharacter(
    projectId: string,
    character: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const startTime = Date.now();
    const characterName = String(character.name ?? "Unknown");
    const characterText = this.characterToText(character);
    const embedding = await this.generateEmbedding(characterText);

    const pointId = uuidv4();
    const payload: CharacterPayload = {
      projectId,
      character,
      name: characterName,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.client.upsert(this.collectionCharacters, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: payload as Record<string, unknown>,
          },
        ],
      });

      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionCharacters,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: 1,
      });

      return pointId;
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionCharacters,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Slice 0: vector search is meaningless in LOCAL mode (deterministic noise
   * vectors). Fail closed — callers get [] and fall back to structured state.
   * Warns once so the degraded mode is visible rather than silent.
   */
  private retrievalDisabled(): boolean {
    if (this.embeddingProvider === EmbeddingProvider.LOCAL) {
      if (!QdrantMemoryService.localSearchWarningEmitted) {
        QdrantMemoryService.localSearchWarningEmitted = true;
        console.warn(
          "[QdrantMemory] Embedding provider is LOCAL (noise vectors); vector retrieval is DISABLED. " +
          "Continuity is served from structured state only. Set OPENAI_API_KEY or GEMINI_API_KEY to enable retrieval."
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Search for characters by semantic similarity
   */
  async searchCharacters(
    projectId: string,
    query: string,
    limit: number = 3
  ): Promise<SearchResult<CharacterPayload>[]> {
    if (this.retrievalDisabled()) return [];
    if (!this.client) return [];

    const startTime = Date.now();
    const queryEmbedding = await this.generateEmbedding(query);

    try {
      const results = await this.client.search(this.collectionCharacters, {
        vector: queryEmbedding,
        limit,
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
      });

      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionCharacters,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
      });

      return results.map((result) => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as CharacterPayload,
      }));
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionCharacters,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Get all characters for a project using scroll API
   * Returns characters with their Qdrant point IDs for accurate matching
   */
  async getProjectCharacters(projectId: string): Promise<CharacterPayload[]> {
    if (!this.client) return [];

    const allCharacters: CharacterPayload[] = [];
    let offset: string | number | undefined = undefined;

    do {
      const results = await this.client.scroll(this.collectionCharacters, {
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
        limit: 100,
        offset,
        with_payload: true,
      });

      for (const point of results.points) {
        const payload = point.payload as CharacterPayload;
        payload.qdrantPointId = String(point.id);
        allCharacters.push(payload);
      }

      const nextOffset = results.next_page_offset;
      offset = typeof nextOffset === "string" || typeof nextOffset === "number" ? nextOffset : undefined;
    } while (offset !== undefined);

    return allCharacters;
  }

  /**
   * Get all worldbuilding elements for a project using scroll API
   * Returns worldbuilding with their Qdrant point IDs for accurate matching
   */
  async getProjectWorldbuilding(projectId: string): Promise<WorldbuildingPayload[]> {
    if (!this.client) return [];

    const allWorldbuilding: WorldbuildingPayload[] = [];
    let offset: string | number | undefined = undefined;

    do {
      const results = await this.client.scroll(this.collectionWorldbuilding, {
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
        limit: 100,
        offset,
        with_payload: true,
      });

      for (const point of results.points) {
        const payload = point.payload as WorldbuildingPayload;
        payload.qdrantPointId = String(point.id);
        allWorldbuilding.push(payload);
      }

      const nextOffset = results.next_page_offset;
      offset = typeof nextOffset === "string" || typeof nextOffset === "number" ? nextOffset : undefined;
    } while (offset !== undefined);

    return allWorldbuilding;
  }

  /**
   * Get all scenes for a project using scroll API
   * Returns scenes with their Qdrant point IDs for accurate matching
   */
  async getProjectScenes(projectId: string): Promise<ScenePayload[]> {
    if (!this.client) return [];

    const allScenes: ScenePayload[] = [];
    let offset: string | number | undefined = undefined;

    do {
      const results = await this.client.scroll(this.collectionScenes, {
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
        limit: 100,
        offset,
        with_payload: true,
      });

      for (const point of results.points) {
        const payload = point.payload as ScenePayload;
        payload.qdrantPointId = String(point.id);
        allScenes.push(payload);
      }

      const nextOffset = results.next_page_offset;
      offset = typeof nextOffset === "string" || typeof nextOffset === "number" ? nextOffset : undefined;
    } while (offset !== undefined);

    return allScenes;
  }

  /**
   * Store worldbuilding element in Qdrant
   */
  async storeWorldbuilding(
    projectId: string,
    elementType: string,
    element: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const startTime = Date.now();
    const elementText = this.worldbuildingToText(elementType, element);
    const embedding = await this.generateEmbedding(elementText);

    const pointId = uuidv4();
    const payload: WorldbuildingPayload = {
      projectId,
      elementType,
      element,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.client.upsert(this.collectionWorldbuilding, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: payload as Record<string, unknown>,
          },
        ],
      });

      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionWorldbuilding,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: 1,
      });

      return pointId;
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionWorldbuilding,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Search for worldbuilding elements by semantic similarity
   */
  async searchWorldbuilding(
    projectId: string,
    query: string,
    limit: number = 5
  ): Promise<SearchResult<WorldbuildingPayload>[]> {
    if (this.retrievalDisabled()) return [];
    if (!this.client) return [];

    const startTime = Date.now();
    const queryEmbedding = await this.generateEmbedding(query);

    try {
      const results = await this.client.search(this.collectionWorldbuilding, {
        vector: queryEmbedding,
        limit,
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
      });

      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionWorldbuilding,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
      });

      return results.map((result) => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as WorldbuildingPayload,
      }));
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionWorldbuilding,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Store a scene in Qdrant
   */
  async storeScene(
    projectId: string,
    sceneNumber: number,
    scene: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Qdrant client not connected");

    const startTime = Date.now();
    const sceneText = this.sceneToText(scene);
    const embedding = await this.generateEmbedding(sceneText);

    const pointId = uuidv4();
    const payload: ScenePayload = {
      projectId,
      sceneNumber,
      scene,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.client.upsert(this.collectionScenes, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: payload as Record<string, unknown>,
          },
        ],
      });

      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionScenes,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: 1,
      });

      return pointId;
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionScenes,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Search for scenes by semantic similarity
   */
  async searchScenes(
    projectId: string,
    query: string,
    limit: number = 2
  ): Promise<SearchResult<ScenePayload>[]> {
    if (this.retrievalDisabled()) return [];
    if (!this.client) return [];

    const startTime = Date.now();
    const queryEmbedding = await this.generateEmbedding(query);

    try {
      const results = await this.client.search(this.collectionScenes, {
        vector: queryEmbedding,
        limit,
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
      });

      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionScenes,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
      });

      return results.map((result) => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as ScenePayload,
      }));
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionScenes,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Delete all data for a project
   */
  async deleteProjectData(projectId: string): Promise<void> {
    if (!this.client) return;

    const collections = [
      this.collectionCharacters,
      this.collectionWorldbuilding,
      this.collectionScenes,
    ];

    for (const collection of collections) {
      await this.client.delete(collection, {
        filter: {
          must: [{ key: "projectId", match: { value: projectId } }],
        },
      });
    }
  }

  /**
   * Convert character to searchable text
   * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
   */
  private characterToText(character: Record<string, unknown>): string {
    const parts: string[] = [];
    
    if (character.name) parts.push(`Name: ${stringifyForPrompt(character.name)}`);
    if (character.archetype) parts.push(`Archetype: ${stringifyForPrompt(character.archetype)}`);
    if (character.role) parts.push(`Role: ${stringifyForPrompt(character.role)}`);
    if (character.coreMotivation) parts.push(`Motivation: ${stringifyForPrompt(character.coreMotivation)}`);
    if (character.psychologicalWound) parts.push(`Wound: ${stringifyForPrompt(character.psychologicalWound)}`);
    if (character.innerTrap) parts.push(`Inner Trap: ${stringifyForPrompt(character.innerTrap)}`);
    if (character.backstory) parts.push(`Backstory: ${stringifyForPrompt(character.backstory)}`);
    if (character.visualSignature) parts.push(`Visual: ${stringifyForPrompt(character.visualSignature)}`);
    if (character.voiceProfile) parts.push(`Voice: ${stringifyForPrompt(character.voiceProfile)}`);
    if (character.relationships) parts.push(`Relationships: ${stringifyForPrompt(character.relationships)}`);

    return parts.join(". ");
  }

  /**
   * Convert worldbuilding element to searchable text
   * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
   */
  private worldbuildingToText(
    elementType: string,
    element: Record<string, unknown>
  ): string {
    const parts: string[] = [`Type: ${elementType}`];

    if (element.name) parts.push(`Name: ${stringifyForPrompt(element.name)}`);
    if (element.description) parts.push(`Description: ${stringifyForPrompt(element.description)}`);
    if (element.location) parts.push(`Location: ${stringifyForPrompt(element.location)}`);
    if (element.significance) parts.push(`Significance: ${stringifyForPrompt(element.significance)}`);

    return parts.join(". ");
  }

  /**
   * Convert scene to searchable text
   * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
   */
  private sceneToText(scene: Record<string, unknown>): string {
    const parts: string[] = [];

    if (scene.sceneNumber) parts.push(`Scene ${scene.sceneNumber}`);
    if (scene.title) parts.push(`Title: ${stringifyForPrompt(scene.title)}`);
    if (scene.setting) parts.push(`Setting: ${stringifyForPrompt(scene.setting)}`);
    if (scene.summary) parts.push(`Summary: ${stringifyForPrompt(scene.summary)}`);
    if (scene.content) {
      const content = stringifyForPrompt(scene.content);
      parts.push(`Content: ${content.substring(0, 500)}`);
    }

    return parts.join(". ");
  }

  /**
   * Disconnect from Qdrant
   */
  async disconnect(): Promise<void> {
    this.client = null;
    this.openaiClient = null;
    this.geminiClient = null;
    this.isConnected = false;
    this.currentGeminiKey = undefined;
    this.currentOpenaiKey = undefined;
  }
}
