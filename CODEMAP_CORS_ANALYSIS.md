# MANOE CORS and Orchestrator Connection - Codemap and Analysis

## 1. Architecture Overview

```
+------------------+     HTTPS      +------------------+     HTTP/2     +------------------+
|                  |  (Cloudflare)  |                  |   (internal)   |                  |
|  Browser/Client  | ------------> |   nginx-proxy    | ------------> |  api-gateway     |
|  (manoe.ilia...) |               |   (reverse proxy)|               |  (Ts.ED/Express) |
|                  |               |                  |               |                  |
+------------------+               +------------------+               +------------------+
        |                                                                      |
        |                                                                      |
        | EventSource (SSE)                                                    |
        | fetch() calls                                                        |
        |                                                                      v
        |                                                             +------------------+
        |                                                             |  Redis Streams   |
        |                                                             |  (event queue)   |
        +-----------------------------------------------------------> +------------------+
                                                                               |
                                                                               v
                                                                      +------------------+
                                                                      | StorytellerOrch. |
                                                                      | (background job) |
                                                                      +------------------+
```

## 2. Request Flow - How It SHOULD Work

### 2.1 Generation Start Flow

```
1. User clicks "Generate" in DashboardPage.tsx
   |
   v
2. DashboardPage calls orchestratorFetch('/generate', { method: 'POST', body: {...} })
   |
   v
3. orchestratorFetch() (api.ts:16-34):
   - Gets JWT token from Supabase
   - Adds Authorization header
   - Calls fetch(`${ORCHESTRATOR_URL}/generate`, ...)
   - ORCHESTRATOR_URL = 'https://manoe-gateway.iliashalkin.com/orchestrate'
   |
   v
4. Browser sends preflight OPTIONS request (CORS):
   - Origin: https://manoe.iliashalkin.com
   - Access-Control-Request-Method: POST
   - Access-Control-Request-Headers: authorization, content-type
   |
   v
5. Request goes through Cloudflare -> nginx-proxy -> api-gateway
   |
   v
6. api-gateway Server.ts handles OPTIONS:
   - cors() middleware (line 93-101) sets CORS headers
   - $beforeRoutesInit() (line 117-136) ALSO sets CORS headers  <-- PROBLEM!
   - Returns 204 with Access-Control-Allow-Origin header
   |
   v
7. Browser validates CORS response:
   - EXPECTED: Access-Control-Allow-Origin: https://manoe.iliashalkin.com
   - ACTUAL: Access-Control-Allow-Origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
   - RESULT: CORS ERROR - multiple values not allowed
```

### 2.2 SSE Stream Flow (if CORS passed)

```
1. After POST /generate returns { run_id: "xxx" }
   |
   v
2. GenerationPage.tsx creates EventSource via useGenerationStream hook
   |
   v
3. useGenerationStream.ts (line 78-82):
   - Calls getAuthenticatedSSEUrl(`/runs/${runId}/events`)
   - Creates new EventSource(sseUrl)
   |
   v
4. getAuthenticatedSSEUrl() (api.ts:40-50):
   - Gets JWT token
   - Returns URL with ?token=xxx query param
   - URL: https://manoe-gateway.iliashalkin.com/orchestrate/runs/{runId}/events?token=xxx
   |
   v
5. Browser sends GET request (SSE):
   - Origin: https://manoe.iliashalkin.com
   - Accept: text/event-stream
   |
   v
6. api-gateway OrchestrationController.ts handles GET /stream/:runId (line 422-525):
   - Sets SSE headers (Content-Type: text/event-stream)
   - Streams events from Redis
   - Sends heartbeat every 15 seconds
```

## 3. CORS Configuration - Current State (PROBLEMATIC)

### 3.1 Environment Variable on VPS
```
CORS_ORIGIN=https://manoe.iliashalkin.com,https://api.iliashalkin.com
```

### 3.2 Server.ts - TWO CORS Configurations

**Location 1: middlewares array (line 92-101)**
```typescript
middlewares: [
  cors({
    origin: process.env.CORS_ORIGIN || "*",  // Gets "https://manoe...,https://api..."
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    exposedHeaders: ["Content-Length", "X-Request-Id"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
  // ...
]
```

**Location 2: $beforeRoutesInit() (line 117-136)**
```typescript
$beforeRoutesInit(): void {
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  
  this.app.use((req: any, res: any, next: any) => {
    res.header("Access-Control-Allow-Origin", corsOrigin);  // Sets AGAIN!
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Max-Age", "86400");
    
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    
    next();
  });
}
```

### 3.3 SocketIO CORS (line 86-91)
```typescript
socketIO: {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
},
```

## 4. Expected vs Actual Behavior

### 4.1 CORS Preflight Response

**Expected:**
```
HTTP/2 204
access-control-allow-origin: https://manoe.iliashalkin.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Accept, Origin
access-control-allow-credentials: true
access-control-max-age: 86400
```

**Actual (tested with curl):**
```
HTTP/2 204
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, x-client-info
access-control-allow-credentials: true
access-control-max-age: 86400
```

### 4.2 Browser Behavior

Browser receives `Access-Control-Allow-Origin` with multiple values separated by comma.
Per CORS spec, this header MUST contain exactly ONE value (or `*`).
Browser rejects the response with error:
```
The 'Access-Control-Allow-Origin' header contains multiple values 
'https://manoe.iliashalkin.com,https://api.iliashalkin.com', but only one is allowed.
```

## 5. Root Causes

### 5.1 Primary: Invalid CORS_ORIGIN format
The `cors()` middleware expects either:
- A single origin string: `"https://manoe.iliashalkin.com"`
- An array of origins: `["https://manoe.iliashalkin.com", "https://localhost:5173"]`
- A function: `(origin, callback) => { ... }`

When given a comma-separated string, it sets the header literally as that string.

### 5.2 Secondary: Duplicate CORS configuration
Both `cors()` middleware AND `$beforeRoutesInit()` set CORS headers.
This can cause:
- Headers being set twice
- Conflicting values
- Unpredictable behavior depending on middleware order

### 5.3 Tertiary: Incorrect origin in whitelist
`api.iliashalkin.com` (Supabase) should NOT be in CORS whitelist.
CORS is for browser->server requests. Backend->Supabase is server-to-server.

## 6. Files Involved

| File | Purpose | CORS Related |
|------|---------|--------------|
| `frontend/src/lib/api.ts` | API client | Uses ORCHESTRATOR_URL |
| `frontend/src/hooks/useGenerationStream.ts` | SSE hook | Creates EventSource |
| `frontend/src/pages/DashboardPage.tsx` | Dashboard | Calls orchestratorFetch |
| `frontend/src/pages/GenerationPage.tsx` | Generation | Uses SSE stream |
| `api-gateway/src/Server.ts` | Server config | CORS middleware + manual headers |
| `api-gateway/src/controllers/OrchestrationController.ts` | API endpoints | SSE streaming |

## 7. Hypotheses to Test

### H1: CORS middleware receives comma-separated string and sets it literally
**Test:** Check if `cors({ origin: "a,b" })` sets header as "a,b"
**Expected:** Yes, it does
**Verification:** curl -i -X OPTIONS with Origin header

### H2: Both CORS configurations are active and potentially conflicting
**Test:** Check if removing $beforeRoutesInit CORS code fixes the issue
**Expected:** Yes, single CORS config should work correctly
**Verification:** Modify code, redeploy, test with curl

### H3: The cors() middleware can handle array of origins correctly
**Test:** Change CORS_ORIGIN to use array format or function
**Expected:** Middleware will echo back the matching origin
**Verification:** curl with different Origin headers

### H4: SSE endpoint has same CORS issue
**Test:** curl -i GET /orchestrate/stream/test-id with Origin header
**Expected:** Same CORS header issue
**Verification:** curl test

### H5: x-api-key header is not in allowedHeaders
**Test:** Check if requests with x-api-key header are blocked
**Expected:** Yes, if frontend sends x-api-key
**Verification:** curl with Access-Control-Request-Headers including x-api-key

## 8. Test Plan

### Test 1: Verify current CORS behavior
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

### Test 2: Verify SSE endpoint CORS
```bash
curl -i 'https://manoe-gateway.iliashalkin.com/orchestrate/stream/test-run-id' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Accept: text/event-stream'
```

### Test 3: Verify x-api-key header handling
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type,x-api-key'
```

### Test 4: Verify actual POST request (after CORS fix)
```bash
curl -i -X POST 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"seedIdea": "test"}'
```

## 9. Test Results (Executed 2025-12-28)

### Test 1: CORS Preflight for POST /generate
**Command:**
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

**Result:**
```
HTTP/2 204 
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, x-client-info
access-control-allow-credentials: true
access-control-max-age: 86400
```

**Analysis:** CONFIRMED - `access-control-allow-origin` contains comma-separated values which is INVALID per CORS spec.

### Test 2: CORS for SSE endpoint
**Command:**
```bash
curl -i 'https://manoe-gateway.iliashalkin.com/orchestrate/stream/test-run-id' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Accept: text/event-stream'
```

**Result:**
```
HTTP/2 404 
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
...
```

**Analysis:** CONFIRMED - SSE endpoint has the same CORS issue. The 404 is expected (test-run-id doesn't exist), but CORS headers are still wrong.

### Test 3: CORS with x-api-key header
**Command:**
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type,x-api-key'
```

**Result:**
```
HTTP/2 204 
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
access-control-allow-headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, x-client-info
```

**Analysis:** ISSUE FOUND - `x-api-key` is NOT in the allowed headers response. If frontend sends x-api-key, it will be blocked.

### Test 4: CORS with different Origin (localhost)
**Command:**
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST'
```

**Result:**
```
HTTP/2 204 
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
```

**Analysis:** CONFIRMED - Server returns STATIC value regardless of Origin header. This means:
1. The cors() middleware is NOT doing origin echo-back
2. Local development (localhost:5173) will also fail CORS

### Test 5: Vary: Origin header
**Result:** NO `Vary: Origin` header present

**Analysis:** ISSUE - Without `Vary: Origin`, CDN/proxies may cache CORS response incorrectly.

## 10. Summary of Confirmed Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Multiple values in Access-Control-Allow-Origin | CRITICAL | CONFIRMED |
| Duplicate CORS configuration (middleware + manual) | HIGH | CONFIRMED |
| api.iliashalkin.com incorrectly in CORS whitelist | MEDIUM | CONFIRMED |
| x-api-key not in allowedHeaders | MEDIUM | CONFIRMED |
| No Vary: Origin header | LOW | CONFIRMED |
| Static CORS response (no origin echo-back) | MEDIUM | CONFIRMED |
| Local development (localhost) blocked | MEDIUM | CONFIRMED |

## 11. Recommended Fixes

### Fix 1: Remove duplicate CORS configuration
Remove the manual CORS headers in `$beforeRoutesInit()` - keep only the `cors()` middleware.

### Fix 2: Fix CORS_ORIGIN format
Change from comma-separated string to proper format:
```typescript
// Option A: Single origin (production only)
CORS_ORIGIN=https://manoe.iliashalkin.com

// Option B: Use function in code for multiple origins
cors({
  origin: (origin, callback) => {
    const whitelist = ['https://manoe.iliashalkin.com', 'http://localhost:5173'];
    if (!origin || whitelist.includes(origin)) {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // ...
})
```

### Fix 3: Remove api.iliashalkin.com from whitelist
This domain is Supabase (backend-to-backend), not a frontend origin.

### Fix 4: Add x-api-key to allowedHeaders
```typescript
allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "x-api-key"]
```

### Fix 5: Ensure Vary: Origin is set
The cors() middleware should handle this automatically when using origin function.
