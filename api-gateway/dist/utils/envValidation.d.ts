/**
 * Environment Variable Validation Utility
 *
 * Validates that all required environment variables are present at startup.
 * This prevents runtime errors from missing configuration.
 */
export interface EnvValidationResult {
    valid: boolean;
    missing: string[];
    warnings: string[];
}
/**
 * Required environment variables for the API Gateway
 * These MUST be set for the application to function correctly
 */
export declare const REQUIRED_ENV_VARS: readonly ["PORT", "NODE_ENV", "REDIS_URL", "SUPABASE_URL", "SUPABASE_KEY", "JWT_SECRET"];
/**
 * Optional but recommended environment variables
 * The application will work without these but with reduced functionality
 */
export declare const OPTIONAL_ENV_VARS: readonly ["CORS_ORIGIN", "QDRANT_URL", "QDRANT_API_KEY", "JWT_EXPIRES_IN", "LOG_LEVEL", "LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"];
/**
 * Environment variables that should have secure values in production
 */
export declare const SECURITY_SENSITIVE_VARS: readonly ["JWT_SECRET", "SUPABASE_KEY", "QDRANT_API_KEY"];
/**
 * Validates all required environment variables are present
 * @returns Validation result with missing vars and warnings
 */
export declare function validateEnvironment(): EnvValidationResult;
/**
 * Validates environment and logs results
 * Throws an error if required variables are missing in production
 */
export declare function validateAndLogEnvironment(): void;
/**
 * Get environment validation status for health check endpoint
 */
export declare function getEnvHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
        requiredPresent: boolean;
        missingRequired: string[];
        warnings: string[];
    };
};
//# sourceMappingURL=envValidation.d.ts.map