"use strict";
/**
 * Environment Variable Validation Utility
 *
 * Validates that all required environment variables are present at startup.
 * This prevents runtime errors from missing configuration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURITY_SENSITIVE_VARS = exports.OPTIONAL_ENV_VARS = exports.REQUIRED_ENV_VARS = void 0;
exports.validateEnvironment = validateEnvironment;
exports.validateAndLogEnvironment = validateAndLogEnvironment;
exports.getEnvHealthStatus = getEnvHealthStatus;
/**
 * Required environment variables for the API Gateway
 * These MUST be set for the application to function correctly
 */
exports.REQUIRED_ENV_VARS = [
    'PORT',
    'NODE_ENV',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'JWT_SECRET',
];
/**
 * Optional but recommended environment variables
 * The application will work without these but with reduced functionality
 */
exports.OPTIONAL_ENV_VARS = [
    'CORS_ORIGIN',
    'QDRANT_URL',
    'QDRANT_API_KEY',
    'JWT_EXPIRES_IN',
    'LOG_LEVEL',
    'LANGFUSE_HOST',
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
];
/**
 * Environment variables that should have secure values in production
 */
exports.SECURITY_SENSITIVE_VARS = [
    'JWT_SECRET',
    'SUPABASE_KEY',
    'QDRANT_API_KEY',
];
/**
 * Default insecure values that should be changed in production
 */
const INSECURE_DEFAULTS = [
    'change-me-in-production',
    'your-jwt-secret-key',
    'your-supabase-service-key',
    'changeme',
    'secret',
    'password',
];
/**
 * Validates all required environment variables are present
 * @returns Validation result with missing vars and warnings
 */
function validateEnvironment() {
    const missing = [];
    const warnings = [];
    // Check required variables
    for (const envVar of exports.REQUIRED_ENV_VARS) {
        const value = process.env[envVar];
        if (!value || value.trim() === '') {
            missing.push(envVar);
        }
    }
    // Check for insecure defaults in production
    if (process.env.NODE_ENV === 'production') {
        for (const envVar of exports.SECURITY_SENSITIVE_VARS) {
            const value = process.env[envVar];
            if (value) {
                const lowerValue = value.toLowerCase();
                if (INSECURE_DEFAULTS.some(insecure => lowerValue.includes(insecure))) {
                    warnings.push(`${envVar} appears to use an insecure default value`);
                }
            }
        }
    }
    // Check if Qdrant URL is set but API key is missing
    if (process.env.QDRANT_URL && (!process.env.QDRANT_API_KEY || process.env.QDRANT_API_KEY.trim() === '')) {
        warnings.push('QDRANT_API_KEY is not set - Qdrant may require authentication');
    }
    return {
        valid: missing.length === 0,
        missing,
        warnings,
    };
}
/**
 * Validates environment and logs results
 * Throws an error if required variables are missing in production
 */
function validateAndLogEnvironment() {
    const result = validateEnvironment();
    if (result.missing.length > 0) {
        console.error('[EnvValidation] Missing required environment variables:', result.missing.join(', '));
    }
    if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
            console.warn('[EnvValidation] Warning:', warning);
        }
    }
    if (!result.valid) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`);
        }
        else {
            console.warn('[EnvValidation] Running in development mode with missing env vars');
        }
    }
    else {
        console.log('[EnvValidation] All required environment variables are present');
    }
}
/**
 * Get environment validation status for health check endpoint
 */
function getEnvHealthStatus() {
    const result = validateEnvironment();
    return {
        status: result.valid ? (result.warnings.length > 0 ? 'degraded' : 'healthy') : 'unhealthy',
        details: {
            requiredPresent: result.valid,
            missingRequired: result.missing,
            warnings: result.warnings,
        },
    };
}
//# sourceMappingURL=envValidation.js.map