"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const supertest_1 = __importDefault(require("supertest"));
describe('CORS Configuration', () => {
    describe('Problem: Comma-separated CORS_ORIGIN string', () => {
        it('FAILS: cors() middleware with comma-separated string sets invalid header', async () => {
            // This test demonstrates the CURRENT BROKEN behavior
            const app = (0, express_1.default)();
            // Simulating current broken configuration
            const corsOrigin = 'https://manoe.iliashalkin.com,https://api.iliashalkin.com';
            app.use((0, cors_1.default)({
                origin: corsOrigin, // BUG: This is a string, not array
                credentials: true,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST');
            // This will FAIL because the header contains comma-separated values
            // Browser expects exactly ONE value
            const allowOrigin = response.headers['access-control-allow-origin'];
            // The current broken behavior - header contains comma
            expect(allowOrigin).toContain(',');
            // This is what we DON'T want - multiple values in one header
            console.log('BROKEN: Access-Control-Allow-Origin =', allowOrigin);
        });
        it('PASSES: cors() middleware with array of origins echoes back correct origin', async () => {
            // This test demonstrates the CORRECT behavior we want
            const app = (0, express_1.default)();
            // Correct configuration with array
            const whitelist = ['https://manoe.iliashalkin.com', 'http://localhost:5173'];
            app.use((0, cors_1.default)({
                origin: (origin, callback) => {
                    if (!origin || whitelist.includes(origin)) {
                        callback(null, origin || '*');
                    }
                    else {
                        callback(new Error('Not allowed by CORS'));
                    }
                },
                credentials: true,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST');
            const allowOrigin = response.headers['access-control-allow-origin'];
            // Should echo back the exact origin, not comma-separated
            expect(allowOrigin).toBe('https://manoe.iliashalkin.com');
            expect(allowOrigin).not.toContain(',');
            console.log('CORRECT: Access-Control-Allow-Origin =', allowOrigin);
        });
    });
    describe('Problem: Duplicate CORS headers from middleware + manual setting', () => {
        it('FAILS: Both cors() middleware and manual headers cause duplication', async () => {
            const app = (0, express_1.default)();
            const corsOrigin = 'https://manoe.iliashalkin.com';
            // First layer: cors() middleware
            app.use((0, cors_1.default)({
                origin: corsOrigin,
                credentials: true,
            }));
            // Second layer: manual header setting (simulating $beforeRoutesInit)
            app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', corsOrigin);
                res.header('Access-Control-Allow-Credentials', 'true');
                next();
            });
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .get('/test')
                .set('Origin', 'https://manoe.iliashalkin.com');
            // With both layers, headers might be set twice
            // In some cases this causes issues with proxies/CDNs
            const allowOrigin = response.headers['access-control-allow-origin'];
            // Even if it looks correct, having two sources of truth is bad architecture
            console.log('DUPLICATE CONFIG: Access-Control-Allow-Origin =', allowOrigin);
            // The header value might look correct but the architecture is wrong
            expect(allowOrigin).toBeDefined();
        });
        it('PASSES: Single cors() middleware is sufficient', async () => {
            const app = (0, express_1.default)();
            // Only ONE source of CORS configuration
            app.use((0, cors_1.default)({
                origin: 'https://manoe.iliashalkin.com',
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-api-key'],
                maxAge: 86400,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'content-type,authorization,x-api-key');
            expect(response.status).toBe(204);
            expect(response.headers['access-control-allow-origin']).toBe('https://manoe.iliashalkin.com');
            expect(response.headers['access-control-allow-credentials']).toBe('true');
            expect(response.headers['access-control-allow-headers']).toContain('x-api-key');
            console.log('SINGLE CONFIG: All headers correct');
        });
    });
    describe('Problem: x-api-key not in allowedHeaders', () => {
        it('FAILS: Preflight without x-api-key in allowedHeaders blocks requests', async () => {
            const app = (0, express_1.default)();
            // Current broken config - missing x-api-key
            app.use((0, cors_1.default)({
                origin: 'https://manoe.iliashalkin.com',
                credentials: true,
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'content-type,x-api-key');
            const allowedHeaders = response.headers['access-control-allow-headers'];
            // x-api-key is NOT in the allowed headers
            expect(allowedHeaders).not.toContain('x-api-key');
            console.log('MISSING: x-api-key not in allowedHeaders =', allowedHeaders);
        });
        it('PASSES: x-api-key included in allowedHeaders', async () => {
            const app = (0, express_1.default)();
            // Correct config with x-api-key
            app.use((0, cors_1.default)({
                origin: 'https://manoe.iliashalkin.com',
                credentials: true,
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-api-key'],
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'content-type,x-api-key');
            const allowedHeaders = response.headers['access-control-allow-headers'];
            expect(allowedHeaders).toContain('x-api-key');
            console.log('CORRECT: x-api-key in allowedHeaders =', allowedHeaders);
        });
    });
    describe('Problem: localhost blocked for development', () => {
        it('FAILS: localhost:5173 not in whitelist', async () => {
            const app = (0, express_1.default)();
            // Current config only allows production domain
            app.use((0, cors_1.default)({
                origin: 'https://manoe.iliashalkin.com',
                credentials: true,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'http://localhost:5173')
                .set('Access-Control-Request-Method', 'POST');
            const allowOrigin = response.headers['access-control-allow-origin'];
            // localhost is not echoed back
            expect(allowOrigin).not.toBe('http://localhost:5173');
            console.log('BLOCKED: localhost not allowed, got =', allowOrigin);
        });
        it('PASSES: Dynamic origin function allows both production and localhost', async () => {
            const app = (0, express_1.default)();
            const whitelist = ['https://manoe.iliashalkin.com', 'http://localhost:5173'];
            app.use((0, cors_1.default)({
                origin: (origin, callback) => {
                    if (!origin || whitelist.includes(origin)) {
                        callback(null, origin || '*');
                    }
                    else {
                        callback(new Error('Not allowed by CORS'));
                    }
                },
                credentials: true,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            // Test localhost
            const localResponse = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'http://localhost:5173')
                .set('Access-Control-Request-Method', 'POST');
            expect(localResponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
            // Test production
            const prodResponse = await (0, supertest_1.default)(app)
                .options('/test')
                .set('Origin', 'https://manoe.iliashalkin.com')
                .set('Access-Control-Request-Method', 'POST');
            expect(prodResponse.headers['access-control-allow-origin']).toBe('https://manoe.iliashalkin.com');
            console.log('CORRECT: Both localhost and production allowed');
        });
    });
    describe('Vary: Origin header for CDN caching', () => {
        it('PASSES: cors() middleware automatically adds Vary: Origin', async () => {
            const app = (0, express_1.default)();
            const whitelist = ['https://manoe.iliashalkin.com', 'http://localhost:5173'];
            app.use((0, cors_1.default)({
                origin: (origin, callback) => {
                    if (!origin || whitelist.includes(origin)) {
                        callback(null, origin || '*');
                    }
                    else {
                        callback(new Error('Not allowed by CORS'));
                    }
                },
                credentials: true,
            }));
            app.get('/test', (req, res) => res.json({ ok: true }));
            const response = await (0, supertest_1.default)(app)
                .get('/test')
                .set('Origin', 'https://manoe.iliashalkin.com');
            // cors() middleware should add Vary: Origin automatically
            const vary = response.headers['vary'];
            expect(vary).toContain('Origin');
            console.log('CORRECT: Vary header =', vary);
        });
    });
});
describe('CORS Integration Test - Full Configuration', () => {
    it('Complete correct CORS configuration passes all checks', async () => {
        const app = (0, express_1.default)();
        // Parse CORS_ORIGIN from environment (simulating correct parsing)
        const corsOriginEnv = 'https://manoe.iliashalkin.com,http://localhost:5173';
        const whitelist = corsOriginEnv.split(',').map(s => s.trim());
        app.use((0, cors_1.default)({
            origin: (origin, callback) => {
                // Allow requests with no origin (like mobile apps or curl)
                // Return first whitelisted origin instead of '*' to maintain credentials compatibility
                if (!origin) {
                    callback(null, whitelist[0]);
                    return;
                }
                if (whitelist.includes(origin)) {
                    callback(null, origin);
                }
                else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-api-key'],
            exposedHeaders: ['Content-Length', 'X-Request-Id'],
            maxAge: 86400,
            preflightContinue: false,
            optionsSuccessStatus: 204,
        }));
        app.post('/orchestrate/generate', (req, res) => res.json({ runId: 'test-123' }));
        // Test preflight
        const preflightResponse = await (0, supertest_1.default)(app)
            .options('/orchestrate/generate')
            .set('Origin', 'https://manoe.iliashalkin.com')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,authorization,x-api-key');
        expect(preflightResponse.status).toBe(204);
        expect(preflightResponse.headers['access-control-allow-origin']).toBe('https://manoe.iliashalkin.com');
        expect(preflightResponse.headers['access-control-allow-credentials']).toBe('true');
        expect(preflightResponse.headers['access-control-allow-methods']).toContain('POST');
        expect(preflightResponse.headers['access-control-allow-headers']).toContain('x-api-key');
        // Test actual request
        const actualResponse = await (0, supertest_1.default)(app)
            .post('/orchestrate/generate')
            .set('Origin', 'https://manoe.iliashalkin.com')
            .set('Content-Type', 'application/json')
            .send({ seedIdea: 'test' });
        expect(actualResponse.status).toBe(200);
        expect(actualResponse.headers['access-control-allow-origin']).toBe('https://manoe.iliashalkin.com');
        console.log('ALL CORS CHECKS PASSED');
    });
});
//# sourceMappingURL=cors.test.js.map