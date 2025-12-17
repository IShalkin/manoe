# Legacy Code Archive

This directory contains archived legacy code that has been replaced by the new TypeScript ts.ed implementation.

## Contents

### orchestrator/
Python-based multi-agent orchestrator using AutoGen framework. This has been replaced by:
- `api-gateway/src/services/StorytellerOrchestrator.ts` - TypeScript orchestration engine
- `api-gateway/src/services/LLMProviderService.ts` - Unified LLM client

### backend/
Original Express.js API backend. This has been replaced by:
- `api-gateway/` - ts.ed framework with Swagger, DI, and validation

## Why Archived?

The migration to ts.ed provides:
1. **End-to-End Type Safety** - From database to API responses
2. **Single Runtime** - No Python/Node.js interop complexity
3. **Auto-generated Swagger** - `/docs` endpoint with full API documentation
4. **Dependency Injection** - Clean service architecture
5. **Native TypeScript SDK support** - OpenAI, Anthropic, Google AI SDKs

## Note

This code is preserved for reference only. Do not use in production.
