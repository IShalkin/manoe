"use strict";
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
exports.WorldBibleEmbeddingService = exports.EmbeddingProvider = exports.WorldBibleSectionType = void 0;
const di_1 = require("@tsed/di");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const crypto_1 = __importDefault(require("crypto"));
const MetricsService_1 = require("./MetricsService");
const schemaNormalizers_1 = require("../utils/schemaNormalizers");
/**
 * World Bible section types
 */
var WorldBibleSectionType;
(function (WorldBibleSectionType) {
    WorldBibleSectionType["CHARACTER"] = "character";
    WorldBibleSectionType["LOCATION"] = "location";
    WorldBibleSectionType["RULE"] = "rule";
    WorldBibleSectionType["TIMELINE"] = "timeline";
    WorldBibleSectionType["CULTURE"] = "culture";
    WorldBibleSectionType["ORGANIZATION"] = "organization";
})(WorldBibleSectionType || (exports.WorldBibleSectionType = WorldBibleSectionType = {}));
/**
 * Embedding provider types (reused from QdrantMemoryService)
 */
var EmbeddingProvider;
(function (EmbeddingProvider) {
    EmbeddingProvider["OPENAI"] = "openai";
    EmbeddingProvider["GEMINI"] = "gemini";
    EmbeddingProvider["LOCAL"] = "local";
})(EmbeddingProvider || (exports.EmbeddingProvider = EmbeddingProvider = {}));
let WorldBibleEmbeddingService = class WorldBibleEmbeddingService {
    client = null;
    openaiClient = null;
    geminiClient = null;
    embeddingProvider = EmbeddingProvider.GEMINI;
    embeddingDimension = 3072; // gemini-embedding-001 outputs 3072 dimensions
    embeddingModel = "gemini-embedding-001"; // Gemini's newest unified embedding model
    isConnected = false;
    metricsService;
    COLLECTION_PREFIX = "manoe_world_bible";
    collectionName = "";
    /**
     * Default similarity threshold for flagging related content
     * Sections with similarity >= threshold are flagged for human review
     * NOTE: High similarity means RELATED content, not contradictory content
     */
    DEFAULT_SIMILARITY_THRESHOLD = 0.7;
    // Track the current API key to detect changes (for re-initialization)
    currentGeminiKey;
    currentOpenaiKey;
    /**
     * Connect to Qdrant and initialize embedding provider
     *
     * Note: This service is a singleton. It will re-initialize when:
     * 1. Previously in LOCAL mode and now has an API key
     * 2. The API key has changed from the previous connection
     * This allows switching API keys without restarting the server.
     */
    async connect(openaiApiKey, geminiApiKey, preferLocal = false) {
        // Check if API key changed - always re-initialize with new key
        // Compare without truthy check to detect both additions AND removals of keys
        const geminiKeyChanged = geminiApiKey !== this.currentGeminiKey;
        const openaiKeyChanged = openaiApiKey !== this.currentOpenaiKey;
        const keyChanged = geminiKeyChanged || openaiKeyChanged;
        // Allow re-initialization if:
        // 1. We were previously disabled (no API key / LOCAL mode) and now have a key
        // 2. The API key has changed
        const hasNewApiKey = !preferLocal && (geminiApiKey || openaiApiKey);
        const hadNoClients = !this.geminiClient && !this.openaiClient;
        const wasDisabled = this.embeddingProvider === EmbeddingProvider.LOCAL || hadNoClients;
        const shouldReinitialize = this.isConnected && (wasDisabled || keyChanged) && hasNewApiKey;
        if (this.isConnected && !shouldReinitialize) {
            return;
        }
        if (shouldReinitialize) {
            if (keyChanged) {
                console.log("WorldBibleEmbedding: Re-initializing with NEW API key");
            }
            else {
                console.log("WorldBibleEmbedding: Re-initializing with API key (was in LOCAL mode)");
            }
        }
        // Store current keys for change detection
        this.currentGeminiKey = geminiApiKey;
        this.currentOpenaiKey = openaiApiKey;
        const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
        const qdrantApiKey = process.env.QDRANT_API_KEY;
        this.client = new js_client_rest_1.QdrantClient({
            url: qdrantUrl,
            apiKey: qdrantApiKey,
        });
        if (!preferLocal && geminiApiKey) {
            this.geminiClient = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
            this.embeddingProvider = EmbeddingProvider.GEMINI;
            this.embeddingDimension = 3072; // gemini-embedding-001 outputs 3072 dimensions
            this.embeddingModel = "gemini-embedding-001";
            console.log("WorldBibleEmbedding: Using Gemini gemini-embedding-001 (3072 dimensions)");
        }
        else if (!preferLocal && openaiApiKey) {
            this.openaiClient = new openai_1.default({ apiKey: openaiApiKey });
            this.embeddingProvider = EmbeddingProvider.OPENAI;
            this.embeddingDimension = 1536;
            this.embeddingModel = "text-embedding-3-small";
            console.log("WorldBibleEmbedding: Using OpenAI embeddings (1536 dimensions)");
        }
        else {
            this.embeddingProvider = EmbeddingProvider.LOCAL;
            this.embeddingDimension = 3072; // Keep consistent dimension for collection naming
            this.embeddingModel = "none";
            console.warn("WorldBibleEmbedding: No embedding API key configured. " +
                "Semantic consistency checking is DISABLED. " +
                "Configure a Gemini API key in Settings to enable semantic search.");
        }
        this.collectionName = `${this.COLLECTION_PREFIX}_v1_${this.embeddingDimension}`;
        await this.ensureCollection();
        this.isConnected = true;
        console.log(`WorldBibleEmbedding: Connected to ${qdrantUrl}, collection: ${this.collectionName}`);
    }
    /**
     * Ensure the World Bible collection exists
     */
    async ensureCollection() {
        if (!this.client)
            return;
        try {
            await this.client.getCollection(this.collectionName);
            console.log(`WorldBibleEmbedding: Collection ${this.collectionName} exists`);
        }
        catch {
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
                // For embedding models, use the full model path format "models/embedding-001"
                // The getGenerativeModel method works for both generative and embedding models
                const modelPath = this.embeddingModel.startsWith("models/")
                    ? this.embeddingModel
                    : `models/${this.embeddingModel}`;
                const model = this.geminiClient.getGenerativeModel({ model: modelPath });
                // Use simple text content for embedContent
                const result = await model.embedContent(text);
                return result.embedding.values;
            }
            catch (error) {
                // Log detailed error for debugging
                const errorDetails = error instanceof Error
                    ? { message: error.message, name: error.name, stack: error.stack?.split('\n')[0] }
                    : error;
                console.error(`WorldBibleEmbedding: Gemini embedContent failed - model: ${this.embeddingModel}, textLength: ${text.length}, error:`, errorDetails);
                throw error;
            }
        }
        else {
            throw new Error("Semantic search unavailable - no embedding API configured. " +
                "Configure a Gemini API key in Settings to enable semantic consistency checking.");
        }
    }
    /**
     * Generate a content hash for deduplication using SHA-256
     */
    generateContentHash(content) {
        return crypto_1.default.createHash("sha256").update(content).digest("hex");
    }
    /**
     * Store a character in the World Bible
     */
    async storeCharacter(projectId, character) {
        const content = this.characterToText(character);
        return this.storeSection(projectId, WorldBibleSectionType.CHARACTER, content, { name: character.name, role: character.role });
    }
    /**
     * Store a location in the World Bible
     */
    async storeLocation(projectId, location) {
        const content = this.locationToText(location);
        return this.storeSection(projectId, WorldBibleSectionType.LOCATION, content, { name: location.name, type: location.type });
    }
    /**
     * Store a world rule in the World Bible
     */
    async storeRule(projectId, rule) {
        const content = this.ruleToText(rule);
        return this.storeSection(projectId, WorldBibleSectionType.RULE, content, { category: rule.category });
    }
    /**
     * Store a timeline event in the World Bible
     */
    async storeTimelineEvent(projectId, event) {
        const content = this.timelineEventToText(event);
        return this.storeSection(projectId, WorldBibleSectionType.TIMELINE, content, { sceneNumber: event.sceneNumber, significance: event.significance });
    }
    /**
     * Store a culture in the World Bible
     */
    async storeCulture(projectId, culture) {
        const content = this.cultureToText(culture);
        return this.storeSection(projectId, WorldBibleSectionType.CULTURE, content, { name: culture.name });
    }
    /**
     * Store an organization in the World Bible
     */
    async storeOrganization(projectId, organization) {
        const content = this.organizationToText(organization);
        return this.storeSection(projectId, WorldBibleSectionType.ORGANIZATION, content, { name: organization.name, type: organization.type });
    }
    /**
     * Generate a deterministic point ID from projectId and content hash
     * This allows idempotent upserts without needing to query for existing points
     */
    generatePointId(projectId, contentHash) {
        return crypto_1.default.createHash("sha256").update(`${projectId}:${contentHash}`).digest("hex");
    }
    /**
     * Store a section in the World Bible
     * Uses deterministic ID based on content hash for idempotent upserts
     */
    async storeSection(projectId, sectionType, content, metadata = {}) {
        if (!this.client)
            throw new Error("WorldBibleEmbedding: Client not connected");
        const startTime = Date.now();
        const contentHash = this.generateContentHash(content);
        const pointId = this.generatePointId(projectId, contentHash);
        const embedding = await this.generateEmbedding(content);
        const now = new Date().toISOString();
        const payload = {
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
                        payload: payload,
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
        }
        catch (error) {
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
    async searchSimilar(projectId, query, limit = 5, sectionType) {
        if (!this.client)
            return [];
        const startTime = Date.now();
        const queryEmbedding = await this.generateEmbedding(query);
        const filter = {
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
                payload: result.payload,
            }));
        }
        catch (error) {
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
    async checkSemanticConsistency(projectId, newContent, threshold = this.DEFAULT_SIMILARITY_THRESHOLD) {
        const similarSections = await this.searchSimilar(projectId, newContent, 10);
        const conflictingSections = similarSections.filter((section) => section.score >= threshold);
        const hasContradiction = conflictingSections.length > 0;
        const maxScore = conflictingSections.length > 0
            ? Math.max(...conflictingSections.map((s) => s.score))
            : 0;
        let explanation;
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
    async getProjectSections(projectId, sectionType) {
        if (!this.client)
            return [];
        const filter = {
            must: [{ key: "projectId", match: { value: projectId } }],
        };
        if (sectionType) {
            filter.must.push({ key: "sectionType", match: { value: sectionType } });
        }
        const allPoints = [];
        const pageSize = 256;
        let offset = undefined;
        while (true) {
            const results = await this.client.scroll(this.collectionName, {
                filter,
                limit: pageSize,
                offset,
                with_payload: true,
                with_vector: false,
            });
            for (const point of results.points) {
                allPoints.push(point.payload);
            }
            if (!results.next_page_offset) {
                break;
            }
            offset = results.next_page_offset;
        }
        return allPoints;
    }
    /**
     * Delete all World Bible data for a project
     */
    async deleteProjectData(projectId) {
        if (!this.client)
            return;
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
    async indexWorldbuilding(projectId, worldbuilding) {
        let indexed = 0;
        const errors = [];
        if (worldbuilding.locations && Array.isArray(worldbuilding.locations)) {
            for (const location of worldbuilding.locations) {
                try {
                    await this.storeLocation(projectId, location);
                    indexed++;
                }
                catch (error) {
                    errors.push(`Failed to index location: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }
        }
        if (worldbuilding.cultures && Array.isArray(worldbuilding.cultures)) {
            for (const culture of worldbuilding.cultures) {
                try {
                    await this.storeCulture(projectId, culture);
                    indexed++;
                }
                catch (error) {
                    errors.push(`Failed to index culture: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }
        }
        if (worldbuilding.rules && Array.isArray(worldbuilding.rules)) {
            for (const rule of worldbuilding.rules) {
                try {
                    await this.storeRule(projectId, rule);
                    indexed++;
                }
                catch (error) {
                    errors.push(`Failed to index rule: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            }
        }
        if (worldbuilding.organizations && Array.isArray(worldbuilding.organizations)) {
            for (const org of worldbuilding.organizations) {
                try {
                    await this.storeOrganization(projectId, org);
                    indexed++;
                }
                catch (error) {
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
    async indexCharacters(projectId, characters) {
        let indexed = 0;
        const errors = [];
        for (const character of characters) {
            try {
                await this.storeCharacter(projectId, character);
                indexed++;
            }
            catch (error) {
                errors.push(`Failed to index character: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        }
        console.log(`WorldBibleEmbedding: Indexed ${indexed} characters for project ${projectId}`);
        return { indexed, errors };
    }
    /**
     * Convert character to searchable text
     */
    characterToText(character) {
        const parts = [];
        if (character.name)
            parts.push(`Character Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.name)}`);
        if (character.role)
            parts.push(`Role: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.role)}`);
        if (character.archetype)
            parts.push(`Archetype: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.archetype)}`);
        if (character.coreMotivation)
            parts.push(`Core Motivation: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.coreMotivation)}`);
        if (character.psychologicalWound)
            parts.push(`Psychological Wound: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.psychologicalWound)}`);
        if (character.innerTrap)
            parts.push(`Inner Trap: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.innerTrap)}`);
        if (character.backstory)
            parts.push(`Backstory: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.backstory)}`);
        if (character.visualSignature)
            parts.push(`Visual Signature: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.visualSignature)}`);
        if (character.voiceProfile)
            parts.push(`Voice Profile: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.voiceProfile)}`);
        if (character.relationships)
            parts.push(`Relationships: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.relationships)}`);
        if (character.physicalDescription)
            parts.push(`Physical Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(character.physicalDescription)}`);
        return parts.join(". ");
    }
    /**
     * Convert location to searchable text
     */
    locationToText(location) {
        const parts = [];
        if (location.name)
            parts.push(`Location Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.name)}`);
        if (location.type)
            parts.push(`Type: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.type)}`);
        if (location.description)
            parts.push(`Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.description)}`);
        if (location.significance)
            parts.push(`Significance: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.significance)}`);
        if (location.atmosphere)
            parts.push(`Atmosphere: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.atmosphere)}`);
        if (location.sensoryDetails)
            parts.push(`Sensory Details: ${(0, schemaNormalizers_1.stringifyForPrompt)(location.sensoryDetails)}`);
        return parts.join(". ");
    }
    /**
     * Convert rule to searchable text
     */
    ruleToText(rule) {
        const parts = [];
        if (rule.category)
            parts.push(`Rule Category: ${(0, schemaNormalizers_1.stringifyForPrompt)(rule.category)}`);
        if (rule.name)
            parts.push(`Rule Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(rule.name)}`);
        if (rule.description)
            parts.push(`Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(rule.description)}`);
        if (rule.implications)
            parts.push(`Implications: ${(0, schemaNormalizers_1.stringifyForPrompt)(rule.implications)}`);
        if (rule.exceptions)
            parts.push(`Exceptions: ${(0, schemaNormalizers_1.stringifyForPrompt)(rule.exceptions)}`);
        return parts.join(". ");
    }
    /**
     * Convert timeline event to searchable text
     */
    timelineEventToText(event) {
        const parts = [];
        if (event.event)
            parts.push(`Event: ${(0, schemaNormalizers_1.stringifyForPrompt)(event.event)}`);
        if (event.sceneNumber)
            parts.push(`Scene: ${event.sceneNumber}`);
        if (event.characters)
            parts.push(`Characters Involved: ${(0, schemaNormalizers_1.stringifyForPrompt)(event.characters)}`);
        if (event.location)
            parts.push(`Location: ${(0, schemaNormalizers_1.stringifyForPrompt)(event.location)}`);
        if (event.significance)
            parts.push(`Significance: ${(0, schemaNormalizers_1.stringifyForPrompt)(event.significance)}`);
        if (event.consequences)
            parts.push(`Consequences: ${(0, schemaNormalizers_1.stringifyForPrompt)(event.consequences)}`);
        return parts.join(". ");
    }
    /**
     * Convert culture to searchable text
     */
    cultureToText(culture) {
        const parts = [];
        if (culture.name)
            parts.push(`Culture Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.name)}`);
        if (culture.description)
            parts.push(`Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.description)}`);
        if (culture.values)
            parts.push(`Values: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.values)}`);
        if (culture.customs)
            parts.push(`Customs: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.customs)}`);
        if (culture.beliefs)
            parts.push(`Beliefs: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.beliefs)}`);
        if (culture.socialStructure)
            parts.push(`Social Structure: ${(0, schemaNormalizers_1.stringifyForPrompt)(culture.socialStructure)}`);
        return parts.join(". ");
    }
    /**
     * Convert organization to searchable text
     */
    organizationToText(organization) {
        const parts = [];
        if (organization.name)
            parts.push(`Organization Name: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.name)}`);
        if (organization.type)
            parts.push(`Type: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.type)}`);
        if (organization.description)
            parts.push(`Description: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.description)}`);
        if (organization.purpose)
            parts.push(`Purpose: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.purpose)}`);
        if (organization.members)
            parts.push(`Members: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.members)}`);
        if (organization.hierarchy)
            parts.push(`Hierarchy: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.hierarchy)}`);
        if (organization.status)
            parts.push(`Status: ${(0, schemaNormalizers_1.stringifyForPrompt)(organization.status)}`);
        return parts.join(". ");
    }
    /**
     * Disconnect from Qdrant
     */
    async disconnect() {
        this.client = null;
        this.isConnected = false;
        console.log("WorldBibleEmbedding: Disconnected");
    }
    /**
     * Check if service is connected to Qdrant
     * Note: This only indicates Qdrant connectivity, not embedding capability.
     * Use `semanticConsistencyEnabled` to check if semantic checks are possible.
     */
    get connected() {
        return this.isConnected;
    }
    /**
     * Check if semantic consistency checking is enabled and functional
     * Returns true only when:
     * 1. Connected to Qdrant
     * 2. An embedding provider (Gemini or OpenAI) is configured
     *
     * Use this property to guard semantic consistency checks in the orchestrator.
     * When false, semantic checks will fail with "LOCAL mode" errors.
     */
    get semanticConsistencyEnabled() {
        return this.isConnected && this.embeddingProvider !== EmbeddingProvider.LOCAL;
    }
    /**
     * Get the current embedding provider
     * Useful for logging which provider is being used for embeddings
     */
    get provider() {
        return this.embeddingProvider;
    }
    /**
     * Get current collection name
     */
    get collection() {
        return this.collectionName;
    }
};
exports.WorldBibleEmbeddingService = WorldBibleEmbeddingService;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", MetricsService_1.MetricsService)
], WorldBibleEmbeddingService.prototype, "metricsService", void 0);
exports.WorldBibleEmbeddingService = WorldBibleEmbeddingService = __decorate([
    (0, di_1.Service)()
], WorldBibleEmbeddingService);
//# sourceMappingURL=WorldBibleEmbeddingService.js.map