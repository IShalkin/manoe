"use strict";
/**
 * Authentication Middleware for MANOE
 * Extracts and validates user_id from Supabase JWT tokens
 *
 * Purpose:
 * - Defense-in-depth: Provides application-layer user verification
 * - Complements Supabase RLS (Row Level Security)
 * - Enables explicit user ownership checks in controllers
 *
 * Security:
 * - Verifies JWT signature using Supabase JWT secret
 * - Extracts user_id from verified token payload
 * - Stores user context in request for downstream use
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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthMiddleware = void 0;
const common_1 = require("@tsed/common");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
let AuthMiddleware = AuthMiddleware_1 = class AuthMiddleware {
    // Paths that don't require authentication
    EXEMPT_PATHS = [
        "/health",
        "/api/health",
        "/metrics",
        "/ready",
        "/live",
        "/docs",
    ];
    /**
     * Extract user context from JWT token
     *
     * Note: This middleware is optional - it extracts user context when available
     * but doesn't block requests without it. Individual controllers can decide
     * whether to require authentication.
     */
    async use(req, res, next, _ctx) {
        // Skip auth extraction for exempt paths
        if (this.isExemptPath(req.path)) {
            next();
            return;
        }
        try {
            const userContext = this.extractUserContext(req);
            if (userContext) {
                req.userContext = userContext;
            }
        }
        catch (error) {
            // Log but don't block - let controllers decide if auth is required
            // Using console.debug for optional auth extraction (not a critical error)
            // eslint-disable-next-line no-console
            console.debug("[AuthMiddleware] Failed to extract user context:", error instanceof Error ? error.message : "Unknown error");
        }
        next();
    }
    isExemptPath(path) {
        return this.EXEMPT_PATHS.some((exemptPath) => path.startsWith(exemptPath));
    }
    /**
     * Extract and verify user context from JWT token
     * Returns null if no token or verification fails
     */
    extractUserContext(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        const token = authHeader.substring(7);
        const jwtSecret = process.env.SUPABASE_JWT_SECRET;
        if (!jwtSecret) {
            // Don't reveal specific environment variable names in production logs
            // eslint-disable-next-line no-console
            console.warn("[AuthMiddleware] JWT secret not configured - JWT verification disabled");
            return null;
        }
        try {
            // Verify and decode JWT token
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            return {
                userId: decoded.sub,
                email: decoded.email,
                role: decoded.role,
            };
        }
        catch (error) {
            // Invalid or expired token
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                // eslint-disable-next-line no-console
                console.debug("[AuthMiddleware] Invalid JWT token:", error.message);
            }
            else if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                // eslint-disable-next-line no-console
                console.debug("[AuthMiddleware] Expired JWT token");
            }
            return null;
        }
    }
    /**
     * Helper function for controllers to require authentication
     * Throws an error if user is not authenticated
     */
    static requireAuth(req) {
        if (!req.userContext) {
            throw new Error("Authentication required");
        }
        return req.userContext;
    }
    /**
     * Helper function for controllers to verify project ownership
     * Throws an error if user doesn't own the project
     */
    static verifyOwnership(req, project) {
        const userContext = AuthMiddleware_1.requireAuth(req);
        if (!project.user_id) {
            throw new Error("Project does not have an owner");
        }
        if (project.user_id !== userContext.userId) {
            throw new Error("Access denied: You do not own this project");
        }
    }
};
exports.AuthMiddleware = AuthMiddleware;
__decorate([
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Next)()),
    __param(3, (0, common_1.Context)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Function, Object]),
    __metadata("design:returntype", Promise)
], AuthMiddleware.prototype, "use", null);
exports.AuthMiddleware = AuthMiddleware = AuthMiddleware_1 = __decorate([
    (0, common_1.Middleware)()
], AuthMiddleware);
//# sourceMappingURL=AuthMiddleware.js.map