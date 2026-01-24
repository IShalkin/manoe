"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const di_1 = require("@tsed/di");
const common_1 = require("@tsed/common");
require("@tsed/platform-express");
require("@tsed/socketio");
require("@tsed/swagger");
const bodyParser = __importStar(require("body-parser"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const method_override_1 = __importDefault(require("method-override"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// Import utility for env validation
const envValidation_1 = require("./utils/envValidation");
// Validate environment variables at startup
// Note: For secure logging of sensitive data (JWT tokens, API keys),
// use secureLogger from ./utils/secureLogging instead of console.*
(0, envValidation_1.validateAndLogEnvironment)();
// Import controllers
const ProjectController_1 = require("./controllers/ProjectController");
const GenerationController_1 = require("./controllers/GenerationController");
const MemoryController_1 = require("./controllers/MemoryController");
const ModelsController_1 = require("./controllers/ModelsController");
const HealthController_1 = require("./controllers/HealthController");
const OrchestrationController_1 = require("./controllers/OrchestrationController");
const StateController_1 = require("./controllers/StateController");
const TracesController_1 = require("./controllers/TracesController");
const ResearchController_1 = require("./controllers/ResearchController");
const DynamicModelsController_1 = require("./controllers/DynamicModelsController");
const MetricsController_1 = require("./controllers/MetricsController");
const FeedbackController_1 = require("./controllers/FeedbackController");
// Import services for state recovery
const StorytellerOrchestrator_1 = require("./services/StorytellerOrchestrator");
const RedisStreamsService_1 = require("./services/RedisStreamsService");
// Import middleware
const RateLimitMiddleware_1 = require("./middleware/RateLimitMiddleware");
const AuthMiddleware_1 = require("./middleware/AuthMiddleware");
const rootDir = __dirname;
let Server = class Server {
    app;
    orchestrator;
    redisStreams;
    settings;
    $beforeRoutesInit() {
        // CORS is now handled entirely by the cors() middleware in the middlewares array
        // This prevents duplicate CORS headers which cause browser errors
        // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMultipleAllowOriginNotAllowed
    }
    async $afterRoutesInit() {
        // Restore any interrupted runs from previous shutdown
        // This ensures active generation runs survive container restarts
        console.log("Server: Initializing state recovery...");
        try {
            const restoredCount = await this.orchestrator.restoreAllInterruptedRuns();
            if (restoredCount > 0) {
                console.log(`Server: Restored ${restoredCount} interrupted generation runs`);
            }
            else {
                console.log("Server: No interrupted runs to restore");
            }
        }
        catch (error) {
            console.error("Server: Failed to restore interrupted runs:", error);
            // Don't fail startup if recovery fails - just log the error
        }
        // Start periodic Redis lag metrics collection (every 30 seconds)
        console.log("Server: Starting Redis lag metrics collection...");
        this.redisStreams.startLagMetricsCollection(30000);
        // Register graceful shutdown handler
        this.registerShutdownHandler();
    }
    /**
     * Register handler for graceful shutdown
     * Saves active run states to Supabase before process exit
     */
    registerShutdownHandler() {
        const shutdown = async (signal) => {
            console.log(`Server: Received ${signal}, initiating graceful shutdown...`);
            try {
                const savedCount = await this.orchestrator.gracefulShutdown(30000);
                console.log(`Server: Graceful shutdown complete. Saved ${savedCount} runs.`);
                process.exit(0);
            }
            catch (error) {
                console.error("Server: Error during graceful shutdown:", error);
                process.exit(1);
            }
        };
        // Handle various shutdown signals
        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
        console.log("Server: Graceful shutdown handler registered");
    }
};
exports.Server = Server;
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", common_1.PlatformApplication)
], Server.prototype, "app", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", StorytellerOrchestrator_1.StorytellerOrchestrator)
], Server.prototype, "orchestrator", void 0);
__decorate([
    (0, di_1.Inject)(),
    __metadata("design:type", RedisStreamsService_1.RedisStreamsService)
], Server.prototype, "redisStreams", void 0);
__decorate([
    (0, di_1.Configuration)(),
    __metadata("design:type", Object)
], Server.prototype, "settings", void 0);
exports.Server = Server = __decorate([
    (0, di_1.Configuration)({
        rootDir,
        acceptMimes: ["application/json"],
        httpPort: process.env.PORT || 3000,
        httpsPort: false,
        mount: {
            "/api": [
                ProjectController_1.ProjectController,
                GenerationController_1.GenerationController,
                MemoryController_1.MemoryController,
                ModelsController_1.ModelsController,
                HealthController_1.HealthController,
                MetricsController_1.MetricsController,
                FeedbackController_1.FeedbackController,
            ],
            "/orchestrate": [
                OrchestrationController_1.OrchestrationController,
                StateController_1.StateController,
                TracesController_1.TracesController,
                ResearchController_1.ResearchController,
                DynamicModelsController_1.DynamicModelsController,
            ],
        },
        swagger: [
            {
                path: "/docs",
                specVersion: "3.0.3",
                spec: {
                    info: {
                        title: "MANOE API Gateway",
                        version: "1.0.0",
                        description: `
# MANOE - Multi-Agent Narrative Orchestration Engine

TypeScript/Ts.ED API Gateway for AI-powered narrative generation.

## Features
- **Multi-Agent Orchestration**: 9 specialized AI agents (Architect, Profiler, Worldbuilder, etc.)
- **Real-time SSE Streaming**: Server-Sent Events for live generation updates
- **LLM Provider Abstraction**: Support for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Venice
- **Vector Memory**: Qdrant-based semantic search for characters and worldbuilding
- **Observability**: Langfuse integration for tracing and prompt management

## Authentication
All endpoints require a valid API key passed via the \`x-api-key\` header or Bearer token.

## Rate Limiting
- Standard endpoints: 100 requests/minute
- Generation endpoints: 10 requests/minute
          `,
                    },
                    tags: [
                        { name: "Orchestration", description: "Narrative generation orchestration" },
                        { name: "Projects", description: "Project management" },
                        { name: "Generation", description: "Legacy generation endpoints" },
                        { name: "Memory", description: "Vector memory operations" },
                        { name: "Models", description: "LLM model information" },
                        { name: "Health", description: "Health check endpoints" },
                    ],
                },
            },
        ],
        socketIO: {
            cors: {
                origin: (origin, callback) => {
                    const corsOriginEnv = process.env.CORS_ORIGIN || "*";
                    if (corsOriginEnv === "*") {
                        callback(null, true);
                        return;
                    }
                    const whitelist = corsOriginEnv.split(",").map(s => s.trim());
                    if (!origin || whitelist.includes(origin)) {
                        callback(null, true);
                    }
                    else {
                        callback(new Error(`Origin ${origin} not allowed by CORS`));
                    }
                },
                methods: ["GET", "POST"],
            },
        },
        middlewares: [
            (0, cors_1.default)({
                origin: (origin, callback) => {
                    const corsOriginEnv = process.env.CORS_ORIGIN || "*";
                    if (corsOriginEnv === "*") {
                        callback(null, "*");
                        return;
                    }
                    const whitelist = corsOriginEnv.split(",").map(s => s.trim());
                    if (!origin || whitelist.includes(origin)) {
                        // For requests without Origin header, return first whitelisted origin
                        // This allows server-to-server calls while maintaining CORS security
                        callback(null, origin || whitelist[0]);
                    }
                    else {
                        callback(new Error(`Origin ${origin} not allowed by CORS`));
                    }
                },
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "x-api-key"],
                exposedHeaders: ["Content-Length", "X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
                preflightContinue: false,
                optionsSuccessStatus: 204,
            }),
            (0, cookie_parser_1.default)(),
            (0, compression_1.default)(),
            (0, method_override_1.default)(),
            bodyParser.json(),
            bodyParser.urlencoded({ extended: true }),
            AuthMiddleware_1.AuthMiddleware,
            RateLimitMiddleware_1.RateLimitMiddleware,
        ],
        exclude: ["**/*.spec.ts"],
        componentsScan: [
            `${rootDir}/middleware/**/*.ts`,
        ],
    })
], Server);
//# sourceMappingURL=Server.js.map