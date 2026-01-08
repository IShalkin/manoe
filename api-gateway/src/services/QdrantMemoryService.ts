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
  [key: string]: unknown;
}

@Service()
export class QdrantMemoryService {
  private client: QdrantClient | null = null;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private embeddingProvider: EmbeddingProvider = EmbeddingProvider.LOCAL;
  private embeddingDimension: number = 384;
  private embeddingModel: string = "all-MiniLM-L6-v2";
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
    const geminiKeyChanged = geminiApiKey && geminiApiKey !== this.currentGeminiKey;
    const openaiKeyChanged = openaiApiKey && openaiApiKey !== this.currentOpenaiKey;
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
      this.embeddingDimension = 768;
      this.embeddingModel = "gemini-embedding-001";
      console.log("Qdrant Memory: Using Gemini gemini-embedding-001 (768 dimensions)");
    } else {
      this.embeddingProvider = EmbeddingProvider.LOCAL;
      this.embeddingDimension = 384;
      this.embeddingModel = "all-MiniLM-L6-v2";
      console.log("Qdrant Memory: Using local embeddings (384 dimensions)");
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

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingProvider === EmbeddingProvider.OPENAI && this.openaiClient) {
      const response = await this.openaiClient.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } else if (this.embeddingProvider === EmbeddingProvider.GEMINI && this.geminiClient) {
      try {
        // Use full model path format "models/gemini-embedding-001" for Gemini API
        const modelPath = this.embeddingModel.startsWith("models/")
          ? this.embeddingModel
          : `models/${this.embeddingModel}`;
        const model = this.geminiClient.getGenerativeModel({ model: modelPath });
        // Use proper content format with role and parts
        const result = await model.embedContent({
          content: { role: "user", parts: [{ text }] },
        });
        return result.embedding.values;
      } catch (error) {
        const errorDetails = error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack?.split('\n')[0] }
          : error;
        console.error(`Qdrant Memory: Gemini embedContent failed - model: ${this.embeddingModel}, textLength: ${text.length}, error:`, errorDetails);
        throw error;
      }
    } else {
      // Local embeddings - return random vector for now
      // In production, use a local embedding model like fastembed
      return Array.from({ length: this.embeddingDimension }, () => Math.random() - 0.5);
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
   * Search for characters by semantic similarity
   */
  async searchCharacters(
    projectId: string,
    query: string,
    limit: number = 3
  ): Promise<SearchResult<CharacterPayload>[]> {
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
   * Get all characters for a project
   */
  async getProjectCharacters(projectId: string): Promise<CharacterPayload[]> {
    if (!this.client) return [];

    const results = await this.client.scroll(this.collectionCharacters, {
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
      limit: 100,
    });

    return results.points.map((point) => point.payload as CharacterPayload);
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
