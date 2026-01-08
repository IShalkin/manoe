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
/**
 * World Bible section types
 */
export declare enum WorldBibleSectionType {
    CHARACTER = "character",
    LOCATION = "location",
    RULE = "rule",
    TIMELINE = "timeline",
    CULTURE = "culture",
    ORGANIZATION = "organization"
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
export declare enum EmbeddingProvider {
    OPENAI = "openai",
    GEMINI = "gemini",
    LOCAL = "local"
}
export declare class WorldBibleEmbeddingService {
    private client;
    private openaiClient;
    private geminiClient;
    private embeddingProvider;
    private embeddingDimension;
    private embeddingModel;
    private isConnected;
    private metricsService;
    private readonly COLLECTION_PREFIX;
    private collectionName;
    /**
     * Default similarity threshold for flagging related content
     * Sections with similarity >= threshold are flagged for human review
     * NOTE: High similarity means RELATED content, not contradictory content
     */
    private readonly DEFAULT_SIMILARITY_THRESHOLD;
    private currentGeminiKey?;
    private currentOpenaiKey?;
    /**
     * Connect to Qdrant and initialize embedding provider
     *
     * Note: This service is a singleton. It will re-initialize when:
     * 1. Previously in LOCAL mode and now has an API key
     * 2. The API key has changed from the previous connection
     * This allows switching API keys without restarting the server.
     */
    connect(openaiApiKey?: string, geminiApiKey?: string, preferLocal?: boolean): Promise<void>;
    /**
     * Ensure the World Bible collection exists
     */
    private ensureCollection;
    /**
     * Generate embedding for text
     */
    private generateEmbedding;
    /**
     * Generate a content hash for deduplication using SHA-256
     */
    private generateContentHash;
    /**
     * Store a character in the World Bible
     */
    storeCharacter(projectId: string, character: Record<string, unknown>): Promise<string>;
    /**
     * Store a location in the World Bible
     */
    storeLocation(projectId: string, location: Record<string, unknown>): Promise<string>;
    /**
     * Store a world rule in the World Bible
     */
    storeRule(projectId: string, rule: Record<string, unknown>): Promise<string>;
    /**
     * Store a timeline event in the World Bible
     */
    storeTimelineEvent(projectId: string, event: Record<string, unknown>): Promise<string>;
    /**
     * Store a culture in the World Bible
     */
    storeCulture(projectId: string, culture: Record<string, unknown>): Promise<string>;
    /**
     * Store an organization in the World Bible
     */
    storeOrganization(projectId: string, organization: Record<string, unknown>): Promise<string>;
    /**
     * Generate a deterministic point ID from projectId and content hash
     * This allows idempotent upserts without needing to query for existing points
     */
    private generatePointId;
    /**
     * Store a section in the World Bible
     * Uses deterministic ID based on content hash for idempotent upserts
     */
    storeSection(projectId: string, sectionType: WorldBibleSectionType, content: string, metadata?: Record<string, unknown>): Promise<string>;
    /**
     * Search for similar World Bible sections
     */
    searchSimilar(projectId: string, query: string, limit?: number, sectionType?: WorldBibleSectionType): Promise<SemanticSearchResult[]>;
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
    checkSemanticConsistency(projectId: string, newContent: string, threshold?: number): Promise<ConsistencyCheckResult>;
    /**
     * Get all World Bible sections for a project
     * Uses pagination to handle large datasets (no hard limit)
     */
    getProjectSections(projectId: string, sectionType?: WorldBibleSectionType): Promise<WorldBiblePayload[]>;
    /**
     * Delete all World Bible data for a project
     */
    deleteProjectData(projectId: string): Promise<void>;
    /**
     * Index entire worldbuilding data into World Bible
     * Call this after worldbuilding phase completes
     */
    indexWorldbuilding(projectId: string, worldbuilding: Record<string, unknown>): Promise<{
        indexed: number;
        errors: string[];
    }>;
    /**
     * Index characters into World Bible
     * Call this after characters phase completes
     */
    indexCharacters(projectId: string, characters: Record<string, unknown>[]): Promise<{
        indexed: number;
        errors: string[];
    }>;
    /**
     * Convert character to searchable text
     */
    private characterToText;
    /**
     * Convert location to searchable text
     */
    private locationToText;
    /**
     * Convert rule to searchable text
     */
    private ruleToText;
    /**
     * Convert timeline event to searchable text
     */
    private timelineEventToText;
    /**
     * Convert culture to searchable text
     */
    private cultureToText;
    /**
     * Convert organization to searchable text
     */
    private organizationToText;
    /**
     * Disconnect from Qdrant
     */
    disconnect(): Promise<void>;
    /**
     * Check if service is connected to Qdrant
     * Note: This only indicates Qdrant connectivity, not embedding capability.
     * Use `semanticConsistencyEnabled` to check if semantic checks are possible.
     */
    get connected(): boolean;
    /**
     * Check if semantic consistency checking is enabled and functional
     * Returns true only when:
     * 1. Connected to Qdrant
     * 2. An embedding provider (Gemini or OpenAI) is configured
     *
     * Use this property to guard semantic consistency checks in the orchestrator.
     * When false, semantic checks will fail with "LOCAL mode" errors.
     */
    get semanticConsistencyEnabled(): boolean;
    /**
     * Get the current embedding provider
     * Useful for logging which provider is being used for embeddings
     */
    get provider(): EmbeddingProvider;
    /**
     * Get current collection name
     */
    get collection(): string;
}
//# sourceMappingURL=WorldBibleEmbeddingService.d.ts.map