/**
 * CORS Configuration Tests
 *
 * These tests verify that CORS headers are correctly configured for the API Gateway.
 *
 * Expected behavior:
 * 1. Single origin in Access-Control-Allow-Origin header (not comma-separated)
 * 2. Origin should be echoed back if in whitelist
 * 3. Credentials should be allowed
 * 4. Preflight requests should return 204
 * 5. x-api-key should be in allowed headers
 */
export {};
//# sourceMappingURL=cors.test.d.ts.map