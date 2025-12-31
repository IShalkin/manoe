# MANOE Monitoring - Next Session Plan

## Session Summary (December 31, 2025)

### Completed Work

1. **Prometheus Metrics Infrastructure**
   - Created `MetricsService.ts` with prom-client library
   - Added `/api/metrics` endpoint via `MetricsController.ts`
   - Integrated metrics into existing Prometheus on VPS (prometheus.iliashalkin.com)

2. **Agent Metrics**
   - `manoe_agent_executions_total` - counter by agent_name, status, error_type
   - `manoe_agent_execution_duration_seconds` - histogram with p50/p95/p99 buckets
   - Integrated into `StorytellerOrchestrator.ts` execution flow

3. **LLM Metrics**
   - `manoe_llm_calls_total` - counter by provider, model, agent_name, status
   - `manoe_llm_call_duration_seconds` - histogram
   - `manoe_llm_tokens_total` - counter by token_type (prompt/completion)
   - `manoe_llm_cost_total` - counter with model pricing (gpt-4o, claude, kimi-k2, etc.)
   - Integrated into `LLMProviderService.ts`

4. **Infrastructure Metrics**
   - `manoe_db_queries_total` - Supabase queries by operation (select/insert), table
   - `manoe_qdrant_operations_total` - Qdrant operations (upsert/search) by collection
   - `manoe_redis_stream_length` - gauge for stream lengths
   - `manoe_redis_consumer_lag` - gauge for consumer group lag (defined but no data - see limitations)

5. **User Feedback**
   - `FeedbackButtons.tsx` component with thumbs up/down
   - `FeedbackController.ts` API endpoint
   - `manoe_user_feedback_total` - counter by feedback_type, agent_name
   - `manoe_regeneration_requests_total` - implicit negative feedback

6. **Grafana Dashboard**
   - `monitoring/grafana/dashboards/manoe-agents.json` - 8 panels
   - Imported to grafana.iliashalkin.com/d/manoe-agents/manoe-agent-metrics

7. **Alert Rules**
   - `monitoring/alerts.yml` - 10 alert rules loaded in Prometheus
   - Agent success rate, latency, Redis lag, LLM rate limits, user satisfaction

8. **Bug Fixes (from Greptile review)**
   - Fixed model name matching (sort by length to avoid gpt-4o matching before gpt-4o-mini)
   - Removed redundant rating label from user feedback metric
   - Fixed metric naming in alerts.yml (manoe_redis_stream_lag → manoe_redis_consumer_lag)

---

## Known Limitations / Not Implemented

### 1. Redis Consumer Lag Metrics (No Data)
**Issue**: `manoe_redis_consumer_lag` metric is defined but has no data because the frontend uses direct polling via SSE, not Redis consumer groups.

**Why**: Consumer groups are typically used when you have multiple consumers processing messages from a stream. MANOE's SSE implementation uses `XREAD BLOCK` directly without consumer groups.

**Options for Next Session**:
- **Option A (Recommended)**: Remove the metric and alert rules since they're not applicable to the current architecture
- **Option B**: Implement consumer groups for SSE connections (significant architecture change)
- **Option C**: Keep the metric for future use when consumer groups are added

### 2. LLM-as-a-Judge Quality Metrics
**Status**: Langfuse integration exists for scoring, but automatic LLM-as-a-Judge evaluation is not implemented.

**What's Missing**:
- Automatic faithfulness scoring (how well Writer output matches Architect plan)
- Automatic relevance scoring (how well character descriptions match user's seed idea)
- These require additional LLM calls to evaluate outputs

**Implementation Plan**:
```typescript
// In LangfuseService.ts, add:
async evaluateFaithfulness(
  runId: string,
  writerOutput: string,
  architectPlan: string
): Promise<number> {
  // Call LLM to evaluate faithfulness
  // Score 0-1 based on how well writer followed the plan
  // Record score in Langfuse
}
```

### 3. Agent Success Rate Gauge
**Status**: `manoe_agent_success_rate` gauge is defined but not populated with calculated rates.

**What's Missing**: Need to calculate rolling success rate from `manoe_agent_executions_total` and update the gauge periodically.

**Implementation Plan**:
```typescript
// Add periodic calculation in MetricsService or Server.ts
setInterval(() => {
  // Query agent_executions_total for last hour
  // Calculate success rate per agent
  // Update agent_success_rate gauge
}, 60000);
```

### 4. CI/CD Tracing
**Status**: Not implemented. User mentioned wanting to track build times and test durations.

**Implementation Plan**:
- Add GitHub Actions workflow metrics
- Track build duration, test pass rate, deployment frequency
- Could use Prometheus Pushgateway or custom metrics endpoint

---

## Recommended Next Steps (Priority Order)

### High Priority

1. **Deploy Latest Code to VPS**
   - The Greptile fixes and README updates are merged but not deployed
   - Need to rebuild api-gateway on VPS with latest code
   ```bash
   ssh root@207.180.224.91
   cd /opt/manoe && git pull origin main
   cd api-gateway && docker build -t manoe-api-gateway .
   docker stop manoe-api-gateway && docker rm manoe-api-gateway
   docker run -d --name manoe-api-gateway --network complete-deploy_proxy \
     -e VIRTUAL_HOST=manoe-gateway.iliashalkin.com \
     -e LETSENCRYPT_HOST=manoe-gateway.iliashalkin.com \
     -e CORS_ORIGIN='https://manoe.iliashalkin.com,https://manoe-orchestrator.iliashalkin.com' \
     -e SUPABASE_URL=http://supabase-kong:8000 \
     -e SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.YzwmTNYsrZTXR0wYpwXIAJTtMP_k5maWlobeR9UxsNo' \
     -e QDRANT_URL=http://qdrant:6333 \
     -e QDRANT_API_KEY='15e4ce20d99081cf1b3d4fda7b09cbe0750e8d87e77f8d2d0bc84d2973b438a0' \
     -e LANGFUSE_HOST=http://langfuse-web:3000 \
     -e REDIS_URL=redis://manoe-redis:6379 \
     manoe-api-gateway
   ```

2. **Clean Up Redis Consumer Lag**
   - Either remove the metric/alerts or document why it's empty
   - Update alerts.yml to remove RedisStreamsLagHigh and RedisStreamsLagCritical alerts
   - Or add a note in the dashboard explaining the limitation

3. **Test FeedbackButtons in Production**
   - Verify thumbs up/down buttons are visible on agent cards
   - Test that clicking them records metrics in Prometheus
   - Check Langfuse for feedback scores

### Medium Priority

4. **Implement LLM-as-a-Judge Evaluation**
   - Add automatic faithfulness scoring after Writer completes
   - Add automatic relevance scoring after Profiler completes
   - Record scores in Langfuse and expose as Prometheus metrics

5. **Add More Supabase Read Metrics**
   - Currently instrumented: getCharacters, getWorldbuilding, getDrafts
   - Consider adding: getProject, getOutline, getCritiques, getRunArtifacts

6. **Grafana Dashboard Improvements**
   - Add panel for database query latency
   - Add panel for Qdrant search latency
   - Add panel for cost breakdown by run_id

### Low Priority

7. **CI/CD Metrics**
   - Add GitHub Actions workflow to report build metrics
   - Track deployment frequency and success rate

8. **Historical Data Analysis**
   - Set up Prometheus retention policy
   - Configure Grafana for long-term trend analysis

---

## Files Modified This Session

### New Files Created
- `api-gateway/src/services/MetricsService.ts` (514 lines)
- `api-gateway/src/controllers/MetricsController.ts` (28 lines)
- `api-gateway/src/controllers/FeedbackController.ts` (220 lines)
- `frontend/src/components/FeedbackButtons.tsx` (145 lines)
- `monitoring/prometheus.yml` (29 lines)
- `monitoring/alerts.yml` (122 lines)
- `monitoring/grafana/dashboards/manoe-agents.json` (829 lines)
- `monitoring/grafana/provisioning/dashboards/dashboards.yml` (14 lines)
- `monitoring/grafana/provisioning/datasources/datasources.yml` (10 lines)

### Files Modified
- `api-gateway/src/Server.ts` - Added MetricsController, FeedbackController, RedisStreamsService injection
- `api-gateway/src/services/LLMProviderService.ts` - Added metrics recording
- `api-gateway/src/services/StorytellerOrchestrator.ts` - Added agent execution metrics
- `api-gateway/src/services/SupabaseService.ts` - Added database query metrics
- `api-gateway/src/services/QdrantMemoryService.ts` - Added Qdrant operation metrics
- `api-gateway/src/services/RedisStreamsService.ts` - Added stream length and lag metrics
- `api-gateway/src/services/LangfuseService.ts` - Added user feedback and quality scoring methods
- `api-gateway/src/agents/BaseAgent.ts` - Added agentType to LLM calls
- `api-gateway/src/models/LLMModels.ts` - Added model pricing
- `frontend/src/components/AgentChat.tsx` - Integrated FeedbackButtons
- `frontend/src/pages/GenerationPage.tsx` - Added FeedbackButtons import
- `README.md` - Added monitoring documentation section

---

## VPS Configuration Reference

### Prometheus Config Location
`/opt/complete-deploy/prometheus.yml`

### Grafana Access
- URL: https://grafana.iliashalkin.com
- Admin: admin / C5s0XQoyCTdvkRSCk4neUA==
- Dashboard: /d/manoe-agents/manoe-agent-metrics

### Alert Rules Location
`/opt/complete-deploy/alerts.yml` (mounted in Prometheus container)

### API Gateway Environment Variables (Critical)
```
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=15e4ce20d99081cf1b3d4fda7b09cbe0750e8d87e77f8d2d0bc84d2973b438a0
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.YzwmTNYsrZTXR0wYpwXIAJTtMP_k5maWlobeR9UxsNo
LANGFUSE_HOST=http://langfuse-web:3000
REDIS_URL=redis://manoe-redis:6379
```

---

## Verification Commands

### Check Metrics Endpoint
```bash
curl -s https://manoe-gateway.iliashalkin.com/api/metrics | head -50
```

### Check Specific Metrics
```bash
curl -s https://manoe-gateway.iliashalkin.com/api/metrics | grep manoe_agent_executions_total
curl -s https://manoe-gateway.iliashalkin.com/api/metrics | grep manoe_llm_calls_total
curl -s https://manoe-gateway.iliashalkin.com/api/metrics | grep manoe_db_queries_total
```

### Check Prometheus Targets
```bash
curl -s -u admin:password https://prometheus.iliashalkin.com/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job == "manoe-api-gateway")'
```

### Check Alert Rules
```bash
curl -s -u admin:password https://prometheus.iliashalkin.com/api/v1/rules | jq '.data.groups[].rules[] | {name: .name, state: .state}'
```
