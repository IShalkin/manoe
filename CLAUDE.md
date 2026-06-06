# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MANOE (Multi-Agent Narrative Orchestration Engine) — an event-driven platform where 9 specialized AI agents collaborate to generate long-form narratives. Two deployable apps in one repo: a React/Vite **frontend** and a Ts.ED (TypeScript) **api-gateway** orchestrator. Infrastructure (Redis, Qdrant, Supabase, Langfuse) runs via Docker Compose.

The repo is a monorepo by convention only — there is no workspace root `package.json`. Each app has its own `package.json`, lockfile, and toolchain. Always `cd` into the app directory before running npm.

## Commands

### api-gateway (Ts.ED orchestrator)
```bash
cd api-gateway
npm ci
npm run dev            # ts-node-dev, watch mode
npm run build          # tsc -> dist/
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src --ext .ts
npm test               # jest (all suites)
npm run test:coverage  # jest with coverage + thresholds
npx jest CriticAgent           # run one suite by filename match
npx jest -t "name of test"     # run tests matching a description
```

### frontend (React + Vite)
```bash
cd frontend
npm ci
npm run dev            # vite dev server
npm run build          # tsc -b && vite build
npm run typecheck      # tsc -b --noEmit
npm run lint           # eslint .
npm run test:run       # vitest (single run, CI mode)
npm test               # vitest watch
```

### Local stack
```bash
docker compose up -d                              # frontend + Redis + Qdrant (local dev UI)
docker compose -f docker-compose.vps.yml up -d --build   # full production stack + observability
```

Copy `.env.example` to `.env` first. At least one LLM provider key is required (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc.).

## Tests

- api-gateway uses **Jest + ts-jest**. Tests are co-located in `api-gateway/src/__tests__/**/*.test.ts` (config: `api-gateway/jest.config.js`). The README's references to a top-level `tests/` directory are stale — there is no such directory; tests live under `src/__tests__/`.
- Coverage thresholds in `jest.config.js` are intentionally low (lines/statements 10%, functions 9%, branches 10%) and are pinned to current coverage. Don't treat them as a quality bar — they exist to prevent regressions. When adding code, don't lower them.
- frontend uses **Vitest** (`frontend/vitest.config.ts`).
- CI (`.github/workflows/ci.yml`) runs against Node 20: api-gateway `tsc --noEmit` + `test:coverage`, then frontend `lint`/`typecheck` (both currently `|| true`, i.e. non-blocking) + build.

## Architecture

Request flow (see README mermaid diagrams for full detail):

1. Frontend `POST /orchestrate/generate` → `OrchestrationController` → `StorytellerOrchestrator.startGeneration()` returns a `runId` (202).
2. Frontend opens an SSE connection `GET /orchestrate/stream/{runId}`; the orchestrator publishes lifecycle events to **Redis Streams** and the frontend subscribes via SSE (`useGenerationStream` hook).
3. The orchestrator runs a **12-phase workflow** with a drafting/critique revision loop (Critic threshold 7/10, max 2 revisions) and quality gates.

Key pieces:
- **`api-gateway/src/services/StorytellerOrchestrator.ts`** (~1400 lines) is the heart — phase transitions, revision loops, the Archivist (runs every 3 scenes to update "Key Constraints" / world state and prevent context drift). Start here for any generation-logic change.
- **`api-gateway/src/agents/`** — one file per agent, all extending `BaseAgent.ts`, instantiated via `AgentFactory.ts`. Agents: Architect, Profiler, Worldbuilder, Strategist, Writer, Critic, Originality, Impact, Archivist.
- **`api-gateway/src/services/`** — `LLMProviderService` (multi-provider BYOK client), `QdrantMemoryService` (vector memory, 1536-dim embeddings, collections: characters/worldbuilding/scenes), `RedisStreamsService` (SSE event bus), `SupabaseService` (artifact persistence), `LangfuseService` (tracing + versioned prompt management), `MetricsService` (Prometheus), `EvaluationService` (LLM-as-judge).
- **`api-gateway/src/models/`** — `AgentModels.ts` (9 agents, 12 phase definitions) and `LLMModels.ts` (6 provider configs + `DEFAULT_MODELS`).
- **Frontend `AgentChat.tsx`** is a thin orchestrator composing `components/chat/*` (13 modular components) and `hooks/use*` (SSE stream, projects, chat editor, generation controls, agent states).

### Cross-cutting behaviors to respect
- **Persistence enables resume & selective regeneration.** Every phase output is saved to Supabase `run_artifacts`. Phase-based regeneration (`start_from_phase` + `previous_run_id`) and scene-level regeneration (`scenes_to_regenerate`) rely on these artifacts being present. Don't break the artifact write path.
- **Model selection precedence:** request `llmConfig.model` > env var > `DEFAULT_MODELS` in `LLMModels.ts`. The `config.model` in Langfuse prompts is metadata only and does NOT override selection.
- **Vector memory drives continuity.** Characters/drafts/worldbuilding rows carry a `qdrant_id` linking to embeddings; the Writer retrieves across all 3 collections for scene context. Keep the SQL row and the Qdrant point in sync.
- **Observability is opt-in via env:** Langfuse tracing activates only when `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` are set. Prometheus metrics are always exposed at `GET /api/metrics`.

## Gotchas

- **`manoe-main/` is a stray nested partial duplicate** (only 9 files under `manoe-main/manoe-main/api-gateway/`). It is not part of the build and not referenced anywhere. Ignore it; do not edit files there expecting them to take effect. Worth deleting if you're cleaning up (ask first).
- `redshift-hhie-eu-mon` MCP server (in the `~/redshift` project scope, not this repo) still has a placeholder password and won't connect until filled.
- ESLint in api-gateway uses the legacy `.eslintrc.js`; frontend uses flat config `eslint.config.js`.
