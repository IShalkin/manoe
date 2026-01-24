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
/**
 * Embedding provider types
 */
export declare enum EmbeddingProvider {
    OPENAI = "openai",
    GEMINI = "gemini",
    LOCAL = "local"
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
export declare class QdrantMemoryService {
    private client;
    private openaiClient;
    private geminiClient;
    private embeddingProvider;
    private embeddingDimension;
    private embeddingModel;
    private isConnected;
    private currentGeminiKey?;
    private currentOpenaiKey?;
    private metricsService;
    private readonly COLLECTION_PREFIX_CHARACTERS;
    private readonly COLLECTION_PREFIX_WORLDBUILDING;
    private readonly COLLECTION_PREFIX_SCENES;
    private collectionCharacters;
    private collectionWorldbuilding;
    private collectionScenes;
    /**
     * Connect to Qdrant and initialize embedding provider
     *
     * Supports re-initialization when API keys change (fixes singleton caching issue).
     *
     * @param openaiApiKey - OpenAI API key for embeddings (highest priority)
     * @param geminiApiKey - Gemini API key for embeddings (second priority)
     * @param preferLocal - If true, use local embeddings even if API keys available
     */
    connect(openaiApiKey?: string, geminiApiKey?: string, preferLocal?: boolean): Promise<void>;
    /**
     * Get embedding provider info
     */
    get providerInfo(): EmbeddingProviderInfo;
    /**
     * Ensure all required collections exist with correct dimensions
     * Uses versioned collection names to prevent data loss when switching embedding providers
     * Old collections are preserved for potential migration
     */
    private ensureCollections;
    /**
     * Generate embedding for text
     */
    private generateEmbedding;
    /**
     * Store a character in Qdrant
     */
    storeCharacter(projectId: string, character: Record<string, unknown>): Promise<string>;
    /**
     * Search for characters by semantic similarity
     */
    searchCharacters(projectId: string, query: string, limit?: number): Promise<SearchResult<CharacterPayload>[]>;
    /**
     * Get all characters for a project using scroll API
     * Returns characters with their Qdrant point IDs for accurate matching
     */
    getProjectCharacters(projectId: string): Promise<CharacterPayload[]>;
    /**
     * Get all worldbuilding elements for a project using scroll API
     * Returns worldbuilding with their Qdrant point IDs for accurate matching
     */
    getProjectWorldbuilding(projectId: string): Promise<WorldbuildingPayload[]>;
    /**
     * Get all scenes for a project using scroll API
     * Returns scenes with their Qdrant point IDs for accurate matching
     */
    getProjectScenes(projectId: string): Promise<ScenePayload[]>;
    /**
     * Store worldbuilding element in Qdrant
     */
    storeWorldbuilding(projectId: string, elementType: string, element: Record<string, unknown>): Promise<string>;
    /**
     * Search for worldbuilding elements by semantic similarity
     */
    searchWorldbuilding(projectId: string, query: string, limit?: number): Promise<SearchResult<WorldbuildingPayload>[]>;
    /**
     * Store a scene in Qdrant
     */
    storeScene(projectId: string, sceneNumber: number, scene: Record<string, unknown>): Promise<string>;
    /**
     * Search for scenes by semantic similarity
     */
    searchScenes(projectId: string, query: string, limit?: number): Promise<SearchResult<ScenePayload>[]>;
    /**
     * Delete all data for a project
     */
    deleteProjectData(projectId: string): Promise<void>;
    /**
     * Convert character to searchable text
     * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
     */
    private characterToText;
    /**
     * Convert worldbuilding element to searchable text
     * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
     */
    private worldbuildingToText;
    /**
     * Convert scene to searchable text
     * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
     */
    private sceneToText;
    /**
     * Disconnect from Qdrant
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=QdrantMemoryService.d.ts.map