/**
 * World Bible Embedding Service for MANOE
 * 
 * Provides vector embeddings for World Bible content to enable semantic
 * similarity search during scene generation. This service stores
 * embeddings for characters, locations, rules, and timeline events,
 * allowing retrieval of related World Bible entries for human review.
 * 
 * IMPORTANT: This service uses cosine similarity to find RELATED content,
 * NOT to detect contradictions. High similarity scores mean the new content
 * is talking about similar topics as existing World Bible entries.
 * 
 * To detect actual contradictions (e.g., "blue eyes" vs "green eyes"),
 * you would need an LLM or specialized NLI model to analyze the semantic
 * meaning of similar content. This service only provides the retrieval step.
 * 
 * Architecture:
 * World Bible -> Embeddings -> Qdrant Collection "world_bible_v{dimension}"
 * New Scene -> Embedding -> Similarity Search
 * If cosine_similarity >= threshold -> Flag for human review (related content found)
 */

import { Service, Inject } from "@tsed/di";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { MetricsService } from "./MetricsService";
import { stringifyForPrompt } from "../utils/schemaNormalizers";

/**
 * World Bible section types
 */
export enum WorldBibleSectionType {
  CHARACTER = "character",
  LOCATION = "location",
  RULE = "rule",
  TIMELINE = "timeline",
  CULTURE = "culture",
  ORGANIZATION = "organization",
}

/**
 * World Bible entry payload stored in Qdrant
 */
export interface WorldBiblePayload {
  projectId: string;
  sectionType: WorldBibleSectionType;
  content: string;
  metadata: Record<string, unknown>;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Semantic search result
 */
export interface SemanticSearchResult {
  id: string;
  score: number;
  payload: WorldBiblePayload;
}

/**
 * Semantic consistency check result
 * 
 * NOTE: This checks for semantic SIMILARITY, not contradiction.
 * hasContradiction=true means related World Bible content was found
 * that may need human review, NOT that a contradiction was detected.
 * The contradictionScore is actually a similarity score (0-1).
 */
export interface ConsistencyCheckResult {
  /** True if related World Bible content was found above threshold (needs review) */
  hasContradiction: boolean;
  /** Similarity score (0-1) - higher means MORE similar, not more contradictory */
  contradictionScore: number;
  /** World Bible sections with high similarity to the new content */
  conflictingSections: SemanticSearchResult[];
  /** Human-readable explanation of what was found */
  explanation?: string;
}

/**
 * Embedding provider types (reused from QdrantMemoryService)
 */
export enum EmbeddingProvider {
  OPENAI = "openai",
  GEMINI = "gemini",
  LOCAL = "local",
}

@Service()
export class WorldBibleEmbeddingService {
  private client: QdrantClient | null = null;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private embeddingProvider: EmbeddingProvider = EmbeddingProvider.GEMINI;
  private embeddingDimension: number = 768;
  private embeddingModel: string = "embedding-001";
  private isConnected: boolean = false;

  @Inject()
  private metricsService!: MetricsService;

  private readonly COLLECTION_PREFIX = "manoe_world_bible";
  private collectionName: string = "";

  /**
   * Default similarity threshold for flagging related content
   * Sections with similarity >= threshold are flagged for human review
   * NOTE: High similarity means RELATED content, not contradictory content
   */
  private readonly DEFAULT_SIMILARITY_THRESHOLD = 0.7;

  /**
   * Connect to Qdrant and initialize embedding provider
   */
  async connect(
    openaiApiKey?: string,
    geminiApiKey?: string,
    preferLocal: boolean = false
  ): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    this.client = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    if (!preferLocal && geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
      this.embeddingProvider = EmbeddingProvider.GEMINI;
      this.embeddingDimension = 768;
      this.embeddingModel = "embedding-001";
      console.log("WorldBibleEmbedding: Using Gemini embedding-001 (768 dimensions)");
    } else if (!preferLocal && openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
      this.embeddingProvider = EmbeddingProvider.OPENAI;
      this.embeddingDimension = 1536;
      this.embeddingModel = "text-embedding-3-small";
      console.log("WorldBibleEmbedding: Using OpenAI embeddings (1536 dimensions)");
    } else {
      this.embeddingProvider = EmbeddingProvider.LOCAL;
      this.embeddingDimension = 768;
      this.embeddingModel = "none";
      console.warn(
        "WorldBibleEmbedding: No embedding API key configured. " +
        "Semantic consistency checking is DISABLED. " +
        "Configure a Gemini API key in Settings to enable semantic search."
      );
    }

    this.collectionName = `${this.COLLECTION_PREFIX}_v1_${this.embeddingDimension}`;
    await this.ensureCollection();
    this.isConnected = true;

    console.log(`WorldBibleEmbedding: Connected to ${qdrantUrl}, collection: ${this.collectionName}`);
  }

  /**
   * Ensure the World Bible collection exists
   */
  private async ensureCollection(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.getCollection(this.collectionName);
      console.log(`WorldBibleEmbedding: Collection ${this.collectionName} exists`);
    } catch {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.embeddingDimension,
          distance: "Cosine",
        },
      });
      console.log(`WorldBibleEmbedding: Created collection ${this.collectionName}`);
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
      const model = this.geminiClient.getGenerativeModel({ model: this.embeddingModel });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } else {
      throw new Error(
        "Semantic search unavailable - no embedding API configured. " +
        "Configure a Gemini API key in Settings to enable semantic consistency checking."
      );
    }
  }

  /**
   * Generate a content hash for deduplication using SHA-256
   */
  private generateContentHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Store a character in the World Bible
   */
  async storeCharacter(
    projectId: string,
    character: Record<string, unknown>
  ): Promise<string> {
    const content = this.characterToText(character);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.CHARACTER,
      content,
      { name: character.name, role: character.role }
    );
  }

  /**
   * Store a location in the World Bible
   */
  async storeLocation(
    projectId: string,
    location: Record<string, unknown>
  ): Promise<string> {
    const content = this.locationToText(location);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.LOCATION,
      content,
      { name: location.name, type: location.type }
    );
  }

  /**
   * Store a world rule in the World Bible
   */
  async storeRule(
    projectId: string,
    rule: Record<string, unknown>
  ): Promise<string> {
    const content = this.ruleToText(rule);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.RULE,
      content,
      { category: rule.category }
    );
  }

  /**
   * Store a timeline event in the World Bible
   */
  async storeTimelineEvent(
    projectId: string,
    event: Record<string, unknown>
  ): Promise<string> {
    const content = this.timelineEventToText(event);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.TIMELINE,
      content,
      { sceneNumber: event.sceneNumber, significance: event.significance }
    );
  }

  /**
   * Store a culture in the World Bible
   */
  async storeCulture(
    projectId: string,
    culture: Record<string, unknown>
  ): Promise<string> {
    const content = this.cultureToText(culture);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.CULTURE,
      content,
      { name: culture.name }
    );
  }

  /**
   * Store an organization in the World Bible
   */
  async storeOrganization(
    projectId: string,
    organization: Record<string, unknown>
  ): Promise<string> {
    const content = this.organizationToText(organization);
    return this.storeSection(
      projectId,
      WorldBibleSectionType.ORGANIZATION,
      content,
      { name: organization.name, type: organization.type }
    );
  }

  /**
   * Generate a deterministic point ID from projectId and content hash
   * This allows idempotent upserts without needing to query for existing points
   */
  private generatePointId(projectId: string, contentHash: string): string {
    return crypto.createHash("sha256").update(`${projectId}:${contentHash}`).digest("hex");
  }

  /**
   * Store a section in the World Bible
   * Uses deterministic ID based on content hash for idempotent upserts
   */
  async storeSection(
    projectId: string,
    sectionType: WorldBibleSectionType,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    if (!this.client) throw new Error("WorldBibleEmbedding: Client not connected");

    const startTime = Date.now();
    const contentHash = this.generateContentHash(content);
    const pointId = this.generatePointId(projectId, contentHash);

    const embedding = await this.generateEmbedding(content);
    const now = new Date().toISOString();

    const payload: WorldBiblePayload = {
      projectId,
      sectionType,
      content,
      metadata,
      contentHash,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.client.upsert(this.collectionName, {
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
        collection: this.collectionName,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: 1,
      });

      return pointId;
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "upsert",
        collection: this.collectionName,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Search for similar World Bible sections
   */
  async searchSimilar(
    projectId: string,
    query: string,
    limit: number = 5,
    sectionType?: WorldBibleSectionType
  ): Promise<SemanticSearchResult[]> {
    if (!this.client) return [];

    const startTime = Date.now();
    const queryEmbedding = await this.generateEmbedding(query);

    const filter: { must: Array<{ key: string; match: { value: string } }> } = {
      must: [{ key: "projectId", match: { value: projectId } }],
    };

    if (sectionType) {
      filter.must.push({ key: "sectionType", match: { value: sectionType } });
    }

    try {
      const results = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        filter,
      });

      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionName,
        durationMs: Date.now() - startTime,
        success: true,
        resultCount: results.length,
      });

      return results.map((result) => ({
        id: String(result.id),
        score: result.score,
        payload: result.payload as WorldBiblePayload,
      }));
    } catch (error) {
      this.metricsService.recordQdrantOperation({
        operation: "search",
        collection: this.collectionName,
        durationMs: Date.now() - startTime,
        success: false,
      });
      throw error;
    }
  }

  /**
   * Check semantic consistency of new content against World Bible
   * 
   * IMPORTANT: This method finds RELATED content, not contradictions.
   * High similarity scores mean the new content is talking about similar
   * topics as existing World Bible entries - this is useful for human review
   * but does NOT indicate actual contradiction.
   * 
   * To detect true contradictions (e.g., "blue eyes" vs "green eyes"),
   * you would need an LLM or NLI model to analyze the semantic meaning.
   * 
   * @param projectId - Project ID
   * @param newContent - New scene content to check
   * @param threshold - Similarity threshold (default: 0.7)
   * @returns Result with related World Bible sections for human review
   */
  async checkSemanticConsistency(
    projectId: string,
    newContent: string,
    threshold: number = this.DEFAULT_SIMILARITY_THRESHOLD
  ): Promise<ConsistencyCheckResult> {
    const similarSections = await this.searchSimilar(projectId, newContent, 10);

    const conflictingSections = similarSections.filter(
      (section) => section.score >= threshold
    );

    const hasContradiction = conflictingSections.length > 0;
    const maxScore = conflictingSections.length > 0
      ? Math.max(...conflictingSections.map((s) => s.score))
      : 0;

    let explanation: string | undefined;
    if (hasContradiction) {
      const sectionTypes = [...new Set(conflictingSections.map((s) => s.payload.sectionType))];
      explanation = `Found ${conflictingSections.length} related World Bible section(s) ` +
        `in categories: ${sectionTypes.join(", ")}. ` +
        `Highest similarity score: ${(maxScore * 100).toFixed(1)}%. ` +
        `Review these sections to ensure consistency with the new content.`;
    }

    return {
      hasContradiction,
      contradictionScore: maxScore,
      conflictingSections,
      explanation,
    };
  }

  /**
   * Get all World Bible sections for a project
   * Uses pagination to handle large datasets (no hard limit)
   */
  async getProjectSections(
    projectId: string,
    sectionType?: WorldBibleSectionType
  ): Promise<WorldBiblePayload[]> {
    if (!this.client) return [];

    const filter: { must: Array<{ key: string; match: { value: string } }> } = {
      must: [{ key: "projectId", match: { value: projectId } }],
    };

    if (sectionType) {
      filter.must.push({ key: "sectionType", match: { value: sectionType } });
    }

    const allPoints: WorldBiblePayload[] = [];
    const pageSize = 256;
    let offset: string | number | undefined = undefined;

    while (true) {
      const results = await this.client.scroll(this.collectionName, {
        filter,
        limit: pageSize,
        offset,
        with_payload: true,
        with_vector: false,
      });

      for (const point of results.points) {
        allPoints.push(point.payload as WorldBiblePayload);
      }

      if (!results.next_page_offset) {
        break;
      }
      offset = results.next_page_offset as string | number;
    }

    return allPoints;
  }

  /**
   * Delete all World Bible data for a project
   */
  async deleteProjectData(projectId: string): Promise<void> {
    if (!this.client) return;

    await this.client.delete(this.collectionName, {
      filter: {
        must: [{ key: "projectId", match: { value: projectId } }],
      },
    });
  }

  /**
   * Index entire worldbuilding data into World Bible
   * Call this after worldbuilding phase completes
   */
  async indexWorldbuilding(
    projectId: string,
    worldbuilding: Record<string, unknown>
  ): Promise<{ indexed: number; errors: string[] }> {
    let indexed = 0;
    const errors: string[] = [];

    if (worldbuilding.locations && Array.isArray(worldbuilding.locations)) {
      for (const location of worldbuilding.locations) {
        try {
          await this.storeLocation(projectId, location as Record<string, unknown>);
          indexed++;
        } catch (error) {
          errors.push(`Failed to index location: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    if (worldbuilding.cultures && Array.isArray(worldbuilding.cultures)) {
      for (const culture of worldbuilding.cultures) {
        try {
          await this.storeCulture(projectId, culture as Record<string, unknown>);
          indexed++;
        } catch (error) {
          errors.push(`Failed to index culture: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    if (worldbuilding.rules && Array.isArray(worldbuilding.rules)) {
      for (const rule of worldbuilding.rules) {
        try {
          await this.storeRule(projectId, rule as Record<string, unknown>);
          indexed++;
        } catch (error) {
          errors.push(`Failed to index rule: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    if (worldbuilding.organizations && Array.isArray(worldbuilding.organizations)) {
      for (const org of worldbuilding.organizations) {
        try {
          await this.storeOrganization(projectId, org as Record<string, unknown>);
          indexed++;
        } catch (error) {
          errors.push(`Failed to index organization: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    console.log(`WorldBibleEmbedding: Indexed ${indexed} worldbuilding elements for project ${projectId}`);
    return { indexed, errors };
  }

  /**
   * Index characters into World Bible
   * Call this after characters phase completes
   */
  async indexCharacters(
    projectId: string,
    characters: Record<string, unknown>[]
  ): Promise<{ indexed: number; errors: string[] }> {
    let indexed = 0;
    const errors: string[] = [];

    for (const character of characters) {
      try {
        await this.storeCharacter(projectId, character);
        indexed++;
      } catch (error) {
        errors.push(`Failed to index character: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    console.log(`WorldBibleEmbedding: Indexed ${indexed} characters for project ${projectId}`);
    return { indexed, errors };
  }

  /**
   * Convert character to searchable text
   */
  private characterToText(character: Record<string, unknown>): string {
    const parts: string[] = [];

    if (character.name) parts.push(`Character Name: ${stringifyForPrompt(character.name)}`);
    if (character.role) parts.push(`Role: ${stringifyForPrompt(character.role)}`);
    if (character.archetype) parts.push(`Archetype: ${stringifyForPrompt(character.archetype)}`);
    if (character.coreMotivation) parts.push(`Core Motivation: ${stringifyForPrompt(character.coreMotivation)}`);
    if (character.psychologicalWound) parts.push(`Psychological Wound: ${stringifyForPrompt(character.psychologicalWound)}`);
    if (character.innerTrap) parts.push(`Inner Trap: ${stringifyForPrompt(character.innerTrap)}`);
    if (character.backstory) parts.push(`Backstory: ${stringifyForPrompt(character.backstory)}`);
    if (character.visualSignature) parts.push(`Visual Signature: ${stringifyForPrompt(character.visualSignature)}`);
    if (character.voiceProfile) parts.push(`Voice Profile: ${stringifyForPrompt(character.voiceProfile)}`);
    if (character.relationships) parts.push(`Relationships: ${stringifyForPrompt(character.relationships)}`);
    if (character.physicalDescription) parts.push(`Physical Description: ${stringifyForPrompt(character.physicalDescription)}`);

    return parts.join(". ");
  }

  /**
   * Convert location to searchable text
   */
  private locationToText(location: Record<string, unknown>): string {
    const parts: string[] = [];

    if (location.name) parts.push(`Location Name: ${stringifyForPrompt(location.name)}`);
    if (location.type) parts.push(`Type: ${stringifyForPrompt(location.type)}`);
    if (location.description) parts.push(`Description: ${stringifyForPrompt(location.description)}`);
    if (location.significance) parts.push(`Significance: ${stringifyForPrompt(location.significance)}`);
    if (location.atmosphere) parts.push(`Atmosphere: ${stringifyForPrompt(location.atmosphere)}`);
    if (location.sensoryDetails) parts.push(`Sensory Details: ${stringifyForPrompt(location.sensoryDetails)}`);

    return parts.join(". ");
  }

  /**
   * Convert rule to searchable text
   */
  private ruleToText(rule: Record<string, unknown>): string {
    const parts: string[] = [];

    if (rule.category) parts.push(`Rule Category: ${stringifyForPrompt(rule.category)}`);
    if (rule.name) parts.push(`Rule Name: ${stringifyForPrompt(rule.name)}`);
    if (rule.description) parts.push(`Description: ${stringifyForPrompt(rule.description)}`);
    if (rule.implications) parts.push(`Implications: ${stringifyForPrompt(rule.implications)}`);
    if (rule.exceptions) parts.push(`Exceptions: ${stringifyForPrompt(rule.exceptions)}`);

    return parts.join(". ");
  }

  /**
   * Convert timeline event to searchable text
   */
  private timelineEventToText(event: Record<string, unknown>): string {
    const parts: string[] = [];

    if (event.event) parts.push(`Event: ${stringifyForPrompt(event.event)}`);
    if (event.sceneNumber) parts.push(`Scene: ${event.sceneNumber}`);
    if (event.characters) parts.push(`Characters Involved: ${stringifyForPrompt(event.characters)}`);
    if (event.location) parts.push(`Location: ${stringifyForPrompt(event.location)}`);
    if (event.significance) parts.push(`Significance: ${stringifyForPrompt(event.significance)}`);
    if (event.consequences) parts.push(`Consequences: ${stringifyForPrompt(event.consequences)}`);

    return parts.join(". ");
  }

  /**
   * Convert culture to searchable text
   */
  private cultureToText(culture: Record<string, unknown>): string {
    const parts: string[] = [];

    if (culture.name) parts.push(`Culture Name: ${stringifyForPrompt(culture.name)}`);
    if (culture.description) parts.push(`Description: ${stringifyForPrompt(culture.description)}`);
    if (culture.values) parts.push(`Values: ${stringifyForPrompt(culture.values)}`);
    if (culture.customs) parts.push(`Customs: ${stringifyForPrompt(culture.customs)}`);
    if (culture.beliefs) parts.push(`Beliefs: ${stringifyForPrompt(culture.beliefs)}`);
    if (culture.socialStructure) parts.push(`Social Structure: ${stringifyForPrompt(culture.socialStructure)}`);

    return parts.join(". ");
  }

  /**
   * Convert organization to searchable text
   */
  private organizationToText(organization: Record<string, unknown>): string {
    const parts: string[] = [];

    if (organization.name) parts.push(`Organization Name: ${stringifyForPrompt(organization.name)}`);
    if (organization.type) parts.push(`Type: ${stringifyForPrompt(organization.type)}`);
    if (organization.description) parts.push(`Description: ${stringifyForPrompt(organization.description)}`);
    if (organization.purpose) parts.push(`Purpose: ${stringifyForPrompt(organization.purpose)}`);
    if (organization.members) parts.push(`Members: ${stringifyForPrompt(organization.members)}`);
    if (organization.hierarchy) parts.push(`Hierarchy: ${stringifyForPrompt(organization.hierarchy)}`);
    if (organization.status) parts.push(`Status: ${stringifyForPrompt(organization.status)}`);

    return parts.join(". ");
  }

  /**
   * Disconnect from Qdrant
   */
  async disconnect(): Promise<void> {
    this.client = null;
    this.isConnected = false;
    console.log("WorldBibleEmbedding: Disconnected");
  }

  /**
   * Check if service is connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current collection name
   */
  get collection(): string {
    return this.collectionName;
  }
}
