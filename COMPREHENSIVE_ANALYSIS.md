# MANOE Comprehensive Architecture Analysis

**Date:** 2025-12-28
**Repositories Analyzed:** 
- `manoe` (main development)
- `manoe_edu` (deployed on VPS at manoe.iliashalkin.com)

---

## 1. Executive Summary

This analysis covers connection issues, architectural problems, and unnecessary complexity in the MANOE project. The VPS deployment uses `manoe_edu` repository, which has the same core architecture as `manoe`.

### Critical Issues Found

| Issue | Severity | Impact |
|-------|----------|--------|
| CORS header duplication | CRITICAL | Blocks all browser requests |
| Run state not persisted | HIGH | Runs lost after container restart |
| Auth token not validated on SSE | MEDIUM | Security vulnerability |
| Debug instrumentation in production | LOW | Performance/noise |

---

## 2. VPS Deployment Configuration (Confirmed)

```
Container: manoe-api-gateway
CORS_ORIGIN=https://manoe.iliashalkin.com,https://api.iliashalkin.com
REDIS_URL=redis://manoe-redis:6379
SUPABASE_URL=http://supabase-kong:8000
```

---

## 3. CORS Issues (CRITICAL)

### 3.1 Problem: Dual CORS Configuration

**Both repositories have the same issue in `api-gateway/src/Server.ts`:**

**Location 1: cors() middleware (lines 93-101)**
```typescript
middlewares: [
  cors({
    origin: process.env.CORS_ORIGIN || "*",  // Gets comma-separated string
    credentials: true,
    // ...
  }),
]
```

**Location 2: $beforeRoutesInit() (lines 118-136)**
```typescript
$beforeRoutesInit(): void {
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  this.app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", corsOrigin);  // Sets AGAIN!
    // ...
  });
}
```

### 3.2 Test Results (Verified with curl)

```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST'
```

**Result:**
```
access-control-allow-origin: https://manoe.iliashalkin.com,https://api.iliashalkin.com
```

**Problem:** Browser requires EXACTLY ONE value in `Access-Control-Allow-Origin`, but server returns comma-separated string.

### 3.3 Root Causes

1. **CORS_ORIGIN format:** Environment variable is comma-separated string, but `cors()` middleware expects single origin, array, or function
2. **Duplicate configuration:** Both middleware and manual header setting are active
3. **Incorrect origin:** `api.iliashalkin.com` (Supabase) shouldn't be in CORS whitelist - it's backend-to-backend

### 3.4 Additional CORS Issues

| Issue | Status |
|-------|--------|
| x-api-key not in allowedHeaders | Confirmed |
| No Vary: Origin header | Confirmed |
| Static response (no origin echo-back) | Confirmed |
| localhost blocked for development | Confirmed |

---

## 4. Run State Recovery Issue (HIGH)

### 4.1 Problem: In-Memory State Only

**StorytellerOrchestrator.ts (line 84):**
```typescript
private activeRuns: Map<string, GenerationState> = new Map();
```

Run state is stored ONLY in memory. When container restarts:
- All active runs are lost
- SSE endpoints return "Run not found"
- User sees generation disappear

### 4.2 Evidence

**restoreRun() method is empty (line 1128-1130):**
```typescript
async restoreRun(): Promise<void> {
  // Empty - not implemented
}
```

**StateController.getStateGraph() only checks in-memory map:**
```typescript
const runStatus = this.orchestrator.getRunStatus(runId);
if (!runStatus) {
  throw new Error(`Run ${runId} not found`);
}
```

### 4.3 User Note Confirms This

> "Run not found" errors after redeploy as a persistent problem - the system should NOT lose track of active generation runs when the orchestrator container is restarted.

---

## 5. Authentication Issues (MEDIUM)

### 5.1 Problem: SSE Token Not Validated

**Frontend sends token in query param (api.ts:48):**
```typescript
url.searchParams.set('token', token);
```

**Backend receives but ignores token (OrchestrationController.ts:538):**
```typescript
async streamEventsLegacy(
  @PathParams("runId") runId: string,
  @QueryParams("token") token: string,  // Declared but never validated!
  @Req() req: Request,
  @Res() res: Response
): Promise<void> {
  return this.streamEvents(runId, req, res);  // Token not passed/checked
}
```

### 5.2 Security Impact

Anyone with a valid runId can subscribe to SSE events without authentication.

---

## 6. SSE Route Configuration (OK)

### 6.1 Routes Exist

Both routes are properly configured:
- `/orchestrate/stream/:runId` - Main route
- `/orchestrate/runs/:runId/events` - Legacy route (delegates to main)

**Frontend uses:** `/runs/${runId}/events` (via getAuthenticatedSSEUrl)
**Backend serves:** Both routes work

### 6.2 SSE Headers (OK)

HTTP/2 compatible headers are set correctly:
```typescript
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache, no-transform");
res.setHeader("X-Accel-Buffering", "no");
res.setHeader("Content-Encoding", "identity");
```

---

## 7. Unnecessary Complexity

### 7.1 Dual CORS Configuration

**Problem:** CORS configured in TWO places with different logic
**Recommendation:** Remove `$beforeRoutesInit()` CORS code, keep only `cors()` middleware

### 7.2 Legacy + New Format Support

**GenerateRequestDTO supports both formats (OrchestrationController.ts:68-119):**
```typescript
// New format
projectId?: string;
seedIdea?: string;
llmConfig?: LLMConfigDTO;

// Legacy format
supabase_project_id?: string;
seed_idea?: string;
provider?: string;
```

**Recommendation:** If legacy clients no longer exist, remove snake_case fields

### 7.3 Debug Instrumentation in Production

**OrchestrationController.ts has debug fetch calls (lines 289-308, 329-350, 368-384):**
```typescript
fetch("http://127.0.0.1:7242/ingest/4ed3716a-6e81-4213-8ba0-e923964d0642", {
  method: "POST",
  // ...debug data
}).catch(() => {});
```

**Recommendation:** Remove or guard behind DEBUG env flag

### 7.4 Duplicate Event Names

**Frontend handles both (useGenerationStream.ts:156):**
```typescript
if (data.type === 'generation_complete' || data.type === 'generation_completed') {
```

**Backend sends:** `generation_completed`
**Recommendation:** Standardize on one name

### 7.5 Event Format Normalization

**Frontend normalizes events (useGenerationStream.ts:101-113):**
```typescript
// Handle legacy format where agent/thought might be at top level
if (rawData.type === 'agent_thought' && !normalizedData.data.agent && rawData.agent) {
  normalizedData.data = { agent: rawData.agent, thought: rawData.thought, ... };
}
```

**Recommendation:** Standardize event format at backend

---

## 8. Recommended Fixes (Priority Order)

### P0: Fix CORS (Blocking)

1. Remove `$beforeRoutesInit()` CORS code
2. Change CORS_ORIGIN to single origin or use function:

```typescript
// Option A: Single origin
CORS_ORIGIN=https://manoe.iliashalkin.com

// Option B: Function in code
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
})
```

### P1: Implement Run State Persistence

1. Save run state to Supabase (new table `generation_runs`)
2. Implement `restoreRun()` to load from DB
3. Call restore on startup for incomplete runs

### P2: Validate SSE Auth Token

1. Extract token validation to shared function
2. Apply to both fetch and SSE endpoints
3. Return 401 if token invalid

### P3: Remove Complexity

1. Remove debug instrumentation
2. Standardize event names
3. Consider removing legacy format support

---

## 9. Test Commands

### Test CORS Preflight
```bash
curl -i -X OPTIONS 'https://manoe-gateway.iliashalkin.com/orchestrate/generate' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

### Test SSE Endpoint
```bash
curl -i 'https://manoe-gateway.iliashalkin.com/orchestrate/runs/test-id/events' \
  -H 'Origin: https://manoe.iliashalkin.com' \
  -H 'Accept: text/event-stream'
```

### Test SSE Without Token (should fail but doesn't)
```bash
curl -i 'https://manoe-gateway.iliashalkin.com/orchestrate/runs/test-id/events' \
  -H 'Origin: https://manoe.iliashalkin.com'
```

---

## 10. Repository Comparison

| Aspect | manoe | manoe_edu |
|--------|-------|-----------|
| CORS dual config | Yes | Yes |
| Run state in-memory | Yes | Yes |
| SSE token ignored | Yes | Yes |
| Debug instrumentation | Yes | Unknown |
| Documentation | Basic | Extensive (CODEMAP.md) |

Both repositories have the same core issues. The `manoe_edu` repository has better documentation but the same architectural problems.
