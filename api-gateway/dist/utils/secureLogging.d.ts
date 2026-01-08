/**
 * Secure Logging Utility
 *
 * Provides functions to redact sensitive information from logs,
 * particularly JWT tokens and API keys.
 */
/**
 * Redacts a sensitive string, showing only the first and last N characters
 * @param value - The sensitive string to redact
 * @param visibleChars - Number of characters to show at start and end (default: 10)
 * @returns Redacted string with middle portion replaced by asterisks
 */
export declare function redactSensitiveString(value: string, visibleChars?: number): string;
/**
 * Redacts JWT token from Authorization header value
 * @param authHeader - The Authorization header value (e.g., "Bearer eyJ...")
 * @returns Redacted authorization header
 */
export declare function redactAuthorizationHeader(authHeader: string): string;
/**
 * Checks if a header name contains sensitive data
 * @param headerName - The header name to check
 * @returns True if the header likely contains sensitive data
 */
export declare function isSensitiveHeader(headerName: string): boolean;
/**
 * Redacts sensitive headers from a headers object
 * @param headers - Object containing HTTP headers
 * @returns New object with sensitive headers redacted
 */
export declare function redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]>;
/**
 * Redacts sensitive data from an error message
 * @param message - The error message that may contain sensitive data
 * @returns Error message with sensitive data redacted
 */
export declare function redactErrorMessage(message: string): string;
/**
 * Creates a safe log object from request data
 * @param req - Express-like request object
 * @returns Safe object for logging
 */
export declare function createSafeRequestLog(req: {
    method?: string;
    url?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, unknown>;
    body?: unknown;
}): Record<string, unknown>;
/**
 * Secure logger adapter that automatically redacts sensitive data.
 * Use this instead of console.* to ensure JWT tokens and API keys are not logged.
 *
 * This approach avoids monkey-patching global console methods which can
 * interfere with third-party libraries and cause unexpected behavior.
 *
 * @example
 * import { secureLogger } from './utils/secureLogging';
 * secureLogger.error('Auth failed for token:', token); // Token will be redacted
 */
export declare const secureLogger: {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
};
//# sourceMappingURL=secureLogging.d.ts.map