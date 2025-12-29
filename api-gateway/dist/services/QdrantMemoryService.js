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
    // Collection names
    COLLECTION_CHARACTERS = "manoe_characters";
    COLLECTION_WORLDBUILDING = "manoe_worldbuilding";
    COLLECTION_SCENES = "manoe_scenes";
    /**
     * Connect to Qdrant and initialize embedding provider
     *
     * @param openaiApiKey - OpenAI API key for embeddings (highest priority)
     * @param geminiApiKey - Gemini API key for embeddings (second priority)
     * @param preferLocal - If true, use local embeddings even if API keys available
     */
    async connect(openaiApiKey, geminiApiKey, preferLocal = false) {
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
            this.embeddingModel = "embedding-001";
            console.log("Qdrant Memory: Using Gemini embeddings (768 dimensions)");
        }
        else {
            this.embeddingProvider = EmbeddingProvider.LOCAL;
            this.embeddingDimension = 384;
            this.embeddingModel = "all-MiniLM-L6-v2";
            console.log("Qdrant Memory: Using local embeddings (384 dimensions)");
        }
        // Ensure collections exist
        await this.ensureCollections();
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
     * Ensure all required collections exist
     */
    async ensureCollections() {
        if (!this.client)
            return;
        const collections = [
            this.COLLECTION_CHARACTERS,
            this.COLLECTION_WORLDBUILDING,
            this.COLLECTION_SCENES,
        ];
        for (const collectionName of collections) {
            try {
                await this.client.getCollection(collectionName);
            }
            catch (error) {
                // Collection doesn't exist, create it
                await this.client.createCollection(collectionName, {
                    vectors: {
                        size: this.embeddingDimension,
                        distance: "Cosine",
                    },
                });
                console.log(`Created Qdrant collection: ${collectionName}`);
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
            const model = this.geminiClient.getGenerativeModel({ model: "embedding-001" });
            const result = await model.embedContent(text);
            return result.embedding.values;
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
        await this.client.upsert(this.COLLECTION_CHARACTERS, {
            points: [
                {
                    id: pointId,
                    vector: embedding,
                    payload: payload,
                },
            ],
        });
        return pointId;
    }
    /**
     * Search for characters by semantic similarity
     */
    async searchCharacters(projectId, query, limit = 3) {
        if (!this.client)
            return [];
        const queryEmbedding = await this.generateEmbedding(query);
        const results = await this.client.search(this.COLLECTION_CHARACTERS, {
            vector: queryEmbedding,
            limit,
            filter: {
                must: [{ key: "projectId", match: { value: projectId } }],
            },
        });
        return results.map((result) => ({
            id: String(result.id),
            score: result.score,
            payload: result.payload,
        }));
    }
    /**
     * Get all characters for a project
     */
    async getProjectCharacters(projectId) {
        if (!this.client)
            return [];
        const results = await this.client.scroll(this.COLLECTION_CHARACTERS, {
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
        const elementText = this.worldbuildingToText(elementType, element);
        const embedding = await this.generateEmbedding(elementText);
        const pointId = (0, uuid_1.v4)();
        const payload = {
            projectId,
            elementType,
            element,
            createdAt: new Date().toISOString(),
        };
        await this.client.upsert(this.COLLECTION_WORLDBUILDING, {
            points: [
                {
                    id: pointId,
                    vector: embedding,
                    payload: payload,
                },
            ],
        });
        return pointId;
    }
    /**
     * Search for worldbuilding elements by semantic similarity
     */
    async searchWorldbuilding(projectId, query, limit = 5) {
        if (!this.client)
            return [];
        const queryEmbedding = await this.generateEmbedding(query);
        const results = await this.client.search(this.COLLECTION_WORLDBUILDING, {
            vector: queryEmbedding,
            limit,
            filter: {
                must: [{ key: "projectId", match: { value: projectId } }],
            },
        });
        return results.map((result) => ({
            id: String(result.id),
            score: result.score,
            payload: result.payload,
        }));
    }
    /**
     * Store a scene in Qdrant
     */
    async storeScene(projectId, sceneNumber, scene) {
        if (!this.client)
            throw new Error("Qdrant client not connected");
        const sceneText = this.sceneToText(scene);
        const embedding = await this.generateEmbedding(sceneText);
        const pointId = (0, uuid_1.v4)();
        const payload = {
            projectId,
            sceneNumber,
            scene,
            createdAt: new Date().toISOString(),
        };
        await this.client.upsert(this.COLLECTION_SCENES, {
            points: [
                {
                    id: pointId,
                    vector: embedding,
                    payload: payload,
                },
            ],
        });
        return pointId;
    }
    /**
     * Search for scenes by semantic similarity
     */
    async searchScenes(projectId, query, limit = 2) {
        if (!this.client)
            return [];
        const queryEmbedding = await this.generateEmbedding(query);
        const results = await this.client.search(this.COLLECTION_SCENES, {
            vector: queryEmbedding,
            limit,
            filter: {
                must: [{ key: "projectId", match: { value: projectId } }],
            },
        });
        return results.map((result) => ({
            id: String(result.id),
            score: result.score,
            payload: result.payload,
        }));
    }
    /**
     * Delete all data for a project
     */
    async deleteProjectData(projectId) {
        if (!this.client)
            return;
        const collections = [
            this.COLLECTION_CHARACTERS,
            this.COLLECTION_WORLDBUILDING,
            this.COLLECTION_SCENES,
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
     */
    characterToText(character) {
        const parts = [];
        if (character.name)
            parts.push(`Name: ${character.name}`);
        if (character.archetype)
            parts.push(`Archetype: ${character.archetype}`);
        if (character.role)
            parts.push(`Role: ${character.role}`);
        if (character.coreMotivation)
            parts.push(`Motivation: ${character.coreMotivation}`);
        if (character.psychologicalWound)
            parts.push(`Wound: ${character.psychologicalWound}`);
        if (character.innerTrap)
            parts.push(`Inner Trap: ${character.innerTrap}`);
        if (character.backstory)
            parts.push(`Backstory: ${character.backstory}`);
        if (character.visualSignature)
            parts.push(`Visual: ${character.visualSignature}`);
        return parts.join(". ");
    }
    /**
     * Convert worldbuilding element to searchable text
     */
    worldbuildingToText(elementType, element) {
        const parts = [`Type: ${elementType}`];
        if (element.name)
            parts.push(`Name: ${element.name}`);
        if (element.description)
            parts.push(`Description: ${element.description}`);
        if (element.location)
            parts.push(`Location: ${element.location}`);
        if (element.significance)
            parts.push(`Significance: ${element.significance}`);
        return parts.join(". ");
    }
    /**
     * Convert scene to searchable text
     */
    sceneToText(scene) {
        const parts = [];
        if (scene.sceneNumber)
            parts.push(`Scene ${scene.sceneNumber}`);
        if (scene.title)
            parts.push(`Title: ${scene.title}`);
        if (scene.setting)
            parts.push(`Setting: ${scene.setting}`);
        if (scene.summary)
            parts.push(`Summary: ${scene.summary}`);
        if (scene.content) {
            const content = String(scene.content);
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
    }
};
exports.QdrantMemoryService = QdrantMemoryService;
exports.QdrantMemoryService = QdrantMemoryService = __decorate([
    (0, di_1.Service)()
], QdrantMemoryService);
//# sourceMappingURL=QdrantMemoryService.js.map