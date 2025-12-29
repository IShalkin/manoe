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
export declare class QdrantMemoryService {
    private client;
    private openaiClient;
    private geminiClient;
    private embeddingProvider;
    private embeddingDimension;
    private embeddingModel;
    private readonly COLLECTION_CHARACTERS;
    private readonly COLLECTION_WORLDBUILDING;
    private readonly COLLECTION_SCENES;
    /**
     * Connect to Qdrant and initialize embedding provider
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
     * If a collection exists with wrong dimensions, recreate it
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
     * Get all characters for a project
     */
    getProjectCharacters(projectId: string): Promise<CharacterPayload[]>;
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