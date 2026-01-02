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
export function redactSensitiveString(value: string, visibleChars: number = 10): string {
  if (!value || typeof value !== 'string') {
    return '[EMPTY]';
  }

  // For very short strings, show asterisks
  if (value.length < visibleChars * 2) {
    return '*'.repeat(Math.min(value.length, 10));
  }

  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const redactedLength = value.length - (visibleChars * 2);
  
  return `${start}...[${redactedLength} chars redacted]...${end}`;
}

/**
 * Redacts JWT token from Authorization header value
 * @param authHeader - The Authorization header value (e.g., "Bearer eyJ...")
 * @returns Redacted authorization header
 */
export function redactAuthorizationHeader(authHeader: string): string {
  if (!authHeader || typeof authHeader !== 'string') {
    return '[EMPTY]';
  }

  // Handle Bearer token format
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.substring(7);
    return `Bearer ${redactSensitiveString(token)}`;
  }

  // Handle Basic auth format
  if (authHeader.toLowerCase().startsWith('basic ')) {
    return 'Basic [REDACTED]';
  }

  // For other formats, redact the entire value
  return redactSensitiveString(authHeader);
}

/**
 * Patterns that indicate sensitive data in header names
 */
const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /api[-_]?key/i,
  /secret/i,
  /password/i,
  /token/i,
];

/**
 * Checks if a header name contains sensitive data
 * @param headerName - The header name to check
 * @returns True if the header likely contains sensitive data
 */
export function isSensitiveHeader(headerName: string): boolean {
  return SENSITIVE_HEADER_PATTERNS.some(pattern => pattern.test(headerName));
}

/**
 * Redacts sensitive headers from a headers object
 * @param headers - Object containing HTTP headers
 * @returns New object with sensitive headers redacted
 */
export function redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const redacted: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (isSensitiveHeader(key)) {
      if (Array.isArray(value)) {
        redacted[key] = value.map(v => 
          key.toLowerCase() === 'authorization' ? redactAuthorizationHeader(v) : redactSensitiveString(v)
        );
      } else {
        redacted[key] = key.toLowerCase() === 'authorization' 
          ? redactAuthorizationHeader(value) 
          : redactSensitiveString(value);
      }
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Redacts sensitive data from an error message
 * @param message - The error message that may contain sensitive data
 * @returns Error message with sensitive data redacted
 */
export function redactErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return message;
  }

  let redacted = message;

  // Redact JWT tokens (eyJ... format)
  redacted = redacted.replace(
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    (match) => redactSensitiveString(match)
  );

  // Redact Bearer tokens in error messages
  redacted = redacted.replace(
    /Bearer\s+[A-Za-z0-9_.-]+/gi,
    (match) => redactAuthorizationHeader(match)
  );

  // Redact API keys (common patterns)
  redacted = redacted.replace(
    /sk-[A-Za-z0-9]{20,}/g,
    (match) => redactSensitiveString(match)
  );

  // Redact Supabase keys
  redacted = redacted.replace(
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    (match) => redactSensitiveString(match)
  );

  return redacted;
}

/**
 * Creates a safe log object from request data
 * @param req - Express-like request object
 * @returns Safe object for logging
 */
export function createSafeRequestLog(req: {
  method?: string;
  url?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}): Record<string, unknown> {
  return {
    method: req.method,
    url: req.url,
    path: req.path,
    headers: req.headers ? redactHeaders(req.headers) : undefined,
    query: req.query,
    // Don't log body by default as it may contain sensitive data
    hasBody: req.body !== undefined && req.body !== null,
  };
}

/**
 * Helper function to redact arguments for logging
 */
function redactArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return redactErrorMessage(arg);
    }
    if (arg instanceof Error) {
      // Only redact the message, preserve the stack for debugging
      const redactedError = new Error(redactErrorMessage(arg.message));
      redactedError.stack = arg.stack;
      redactedError.name = arg.name;
      return redactedError;
    }
    return arg;
  });
}

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
export const secureLogger = {
  error: (...args: unknown[]): void => {
    console.error(...redactArgs(args));
  },
  warn: (...args: unknown[]): void => {
    console.warn(...redactArgs(args));
  },
  log: (...args: unknown[]): void => {
    console.log(...redactArgs(args));
  },
  info: (...args: unknown[]): void => {
    console.info(...redactArgs(args));
  },
  debug: (...args: unknown[]): void => {
    console.debug(...redactArgs(args));
  },
};
