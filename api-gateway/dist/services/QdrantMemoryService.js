"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantMemoryService = exports.EmbeddingProvider = void 0;
const di_1 = require("@tsed/di");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const uuid_1 = require("uuid");
const schemaNormalizers_1 = require("../utils/schemaNormalizers");
const MetricsService_1 = require("./MetricsService");
/**
 * Embedding provider types
 */
var EmbeddingProvider;
(function (EmbeddingProvider) {
    EmbeddingProvider["OPENAI"] = "openai";
    EmbeddingProvider["GEMINI"] = "gemini";
    EmbeddingProvider["LOCAL"] = "local";
})(EmbeddingProvider || (exports.EmbeddingProvider = EmbeddingProvider = {}));
let QdrantMemoryService = class QdrantMemoryService {
    client = null;
    openaiClient = null;
    geminiClient = null;
    embeddingProvider = EmbeddingProvider.LOCAL;
    embeddingDimension = 384;
    embeddingModel = "all-MiniLM-L6-v2";
    isConnected = false;
    // Track current API keys to detect changes (fixes singleton caching issue)
    currentGeminiKey;
    currentOpenaiKey;
    metricsService;
    // Collection name prefixes (versioned with dimension suffix)
    COLLECTION_PREFIX_CHARACTERS = "manoe_characters";
    COLLECTION_PREFIX_WORLDBUILDING = "manoe_worldbuilding";
    COLLECTION_PREFIX_SCENES = "manoe_scenes";
    // Versioned collection names (set after embedding provider is determined)
    collectionCharacters = "";
    collectionWorldbuilding = "";
    collectionScenes = "";
    /**
     * Connect to Qdrant and initialize embedding provider
     *
     * Supports re-initialization when API keys change (fixes singleton caching issue).
     *
     * @param openaiApiKey - OpenAI API key for embeddings (highest priority)
     * @param geminiApiKey - Gemini API key for embeddings (second priority)
     * @param preferLocal - If true, use local embeddings even if API keys available
     */
    async connect(openaiApiKey, geminiApiKey, preferLocal = false) {
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
        this.client = new js_client_rest_1.QdrantClient({
            url: qdrantUrl,
            apiKey: qdrantApiKey,
        });
        // Initialize embedding provider
        if (!preferLocal && openaiApiKey) {
            this.openaiClient = new openai_1.default({ apiKey: openaiApiKey });
            this.embeddingProvider = EmbeddingProvider.OPENAI;
            this.embeddingDimension = 1536;
            this.embeddingModel = "text-embedding-3-small";
            console.log("Qdrant Memory: Using OpenAI embeddings (1536 dimensions)");
        }
        else if (!preferLocal && geminiApiKey) {
            this.geminiClient = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
            this.embeddingProvider = EmbeddingProvider.GEMINI;
            this.embeddingDimension = 768;
            this.embeddingModel = "gemini-embedding-001";
            console.log("Qdrant Memory: Using Gemini gemini-embedding-001 (768 dimensions)");
        }
        else {
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
    get providerInfo() {
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
    async ensureCollections() {
        if (!this.client)
            return;
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
            }
            catch (error) {
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
    async generateEmbedding(text) {
        if (this.embeddingProvider === EmbeddingProvider.OPENAI && this.openaiClient) {
            const response = await this.openaiClient.embeddings.create({
                model: this.embeddingModel,
                input: text,
            });
            return response.data[0].embedding;
        }
        else if (this.embeddingProvider === EmbeddingProvider.GEMINI && this.geminiClient) {
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
            }
            catch (error) {
                const errorDetails = error instanceof Error
                    ? { message: error.message, name: error.name, stack: error.stack?.split('\n')[0] }
                    : error;
                console.error(`Qdrant Memory: Gemini embedContent failed - model: ${this.embeddingModel}, textLength: ${text.length}, error:`, errorDetails);
                throw error;
            }
        }
        else {
            // Local embeddings - return random vector for now
            // In production, use a local embedding model like fastembed
            return Array.from({ length: this.embeddingDimension }, () => Math.random() - 0.5);
        }
    }
    /**
     * Store a character in Qdrant
     */
    async storeCharacter(projectId, character) {
        if (!this.client)
            throw new Error("Qdrant client not connected");
        const startTime = Date.now();
        const characterName = String(character.name ?? "Unknown");
        const characterText = this.characterToText(character);
        const embedding = await this.generateEmbedding(characterText);
        const pointId = (0, uuid_1.v4)();
        const payload = {
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
                        payload: payload,
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
        }
        catch (error) {
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
    async searchCharacters(projectId, query, limit = 3) {
        if (!this.client)
            return [];
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
                payload: result.payload,
            }));
        }
        catch (error) {
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
    async getProjectCharacters(projectId) {
        if (!this.client)
            return [];
        const results = await this.client.scroll(this.collectionCharacters, {
            filter: {
                must: [{ key: "projectId", match: { value: projectId } }],
            },
            limit: 100,
        });
        return results.points.map((point) => point.payload);
    }
    /**
     * Store worldbuilding element in Qdrant
     */
    async storeWorldbuilding(projectId, elementType, element) {
        if (!this.client)
            throw new Error("Qdrant client not connected");
        const startTime = Date.now();
        const elementText = this.worldbuildingToText(elementType, element);
        const embedding = await this.generateEmbedding(elementText);
        const pointId = (0, uuid_1.v4)();
        const payload = {
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
                        payload: payload,
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
        }
        catch (error) {
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
    async searchWorldbuilding(projectId, query, limit = 5) {
        if (!this.client)
            return [];
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
                payload: result.payload,
            }));
        }
        catch (error) {
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
    async storeScene(projectId, sceneNumber, scene) {
        if (!this.client)
            throw new Error("Qdrant client not connected");
        const startTime = Date.now();
        const sceneText = this.sceneToText(scene);
        const embedding = await this.generateEmbedding(sceneText);
        const pointId = (0, uuid_1.v4)();
        const payload = {
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
                        payload: payload,
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
        }
        catch (error) {
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
    async searchScenes(projectId, query, limit = 2) {
        if (!this.client)
            return [];
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
                payload: result.payload,
            }));
        }
        catch (error) {
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
    async deleteProjectData(projectId) {
        if (!this.client)
            return;
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
    characterToText(character) {
        const parts = [];
        if (character.name)
            parts.push(`Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.name)}`);
        if (character.archetype)
            parts.push(`Archetype: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.archetype)}`);
        if (character.role)
            parts.push(`Role: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.role)}`);
        if (character.coreMotivation)
            parts.push(`Motivation: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.coreMotivation)}`);
        if (character.psychologicalWound)
            parts.push(`Wound: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.psychologicalWound)}`);
        if (character.innerTrap)
            parts.push(`Inner Trap: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.innerTrap)}`);
        if (character.backstory)
            parts.push(`Backstory: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.backstory)}`);
        if (character.visualSignature)
            parts.push(`Visual: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.visualSignature)}`);
        if (character.voiceProfile)
            parts.push(`Voice: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.voiceProfile)}`);
        if (character.relationships)
            parts.push(`Relationships: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.relationships)}`);
        return parts.join(". ");
    }
    /**
     * Convert worldbuilding element to searchable text
     * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
     */
    worldbuildingToText(elementType, element) {
        const parts = [`Type: ${elementType}`];
        if (element.name)
            parts.push(`Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(element.name)}`);
        if (element.description)
            parts.push(`Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(element.description)}`);
        if (element.location)
            parts.push(`Location: ${(0, schemaNormalizers_1.stringifyForPrompt)(element.location)}`);
        if (element.significance)
            parts.push(`Significance: ${(0, schemaNormalizers_1.stringifyForPrompt)(element.significance)}`);
        return parts.join(". ");
    }
    /**
     * Convert scene to searchable text
     * Uses stringifyForPrompt to prevent [object Object] bugs when fields are objects
     */
    sceneToText(scene) {
        const parts = [];
        if (scene.sceneNumber)
            parts.push(`Scene ${scene.sceneNumber}`);
        if (scene.title)
            parts.push(`Title: ${(0, schemaNormalizers_1.stringifyForPrompt)(scene.title)}`);
        if (scene.setting)
            parts.push(`Setting: ${(0, schemaNormalizers_1.stringifyForPrompt)(scene.setting)}`);
        if (scene.summary)
            parts.push(`Summary: ${(0, schemaNormalizers_1.stringifyForPrompt)(scene.summary)}`);
        if (scene.content) {
            const content = (0, schemaNormalizers_1.stringifyForPrompt)(scene.content);
            parts.push(`Content: ${content.substring(0, 500)}`);
        }
        return parts.join(". ");
    }
    /**
     * Disconnect from Qdrant
     */
    async disconnect() {
        this.client = null;
        this.openaiClient = null;
        this.geminiClient = null;
        this.isConnected = false;
        this.currentGeminiKey = undefined;
        this.currentOpenaiKey = undefined;
    }
};
exports.QdrantMemoryService = QdrantMemoryService;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], QdrantMemoryService.prototype, "metricsService", void 0);
exports.QdrantMemoryService = QdrantMemoryService = __decorate([
    (0, di_1.Service)()
], QdrantMemoryService);
//# sourceMappingURL=QdrantMemoryService.js.map