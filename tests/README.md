# MANOE Test Suite

This directory contains repo-root test entrypoints for the MANOE Multi-Agent Narrative Orchestration Engine.

The canonical test implementations live in `api-gateway/src/__tests__/`.

## Test Structure

```
tests/
├── cors.test.ts                    # CORS configuration tests
├── CriticAgent.test.ts             # Critic agent implementation tests
├── EvaluationService.test.ts         # LLM-as-a-Judge evaluation tests
├── WriterAgent.test.ts              # Writer agent implementation tests
├── WorldBibleEmbeddingService.test.ts # Vector embedding tests
├── dataConsistencyChecker.test.ts   # Data consistency validation tests
├── schemaNormalizers.test.ts        # Schema normalization tests
├── SupabaseSchemas.test.ts        # Supabase schema validation tests
├── stringUtils.test.ts             # String utility function tests
└── tokenLimitCache.test.ts         # Token limit caching tests
```

## Running Tests

> **Note:** Run tests from `api-gateway/` because that's where `node_modules/` and `jest.config.js` live.
> The test files are stored in this repo-root `tests/` directory, but Jest is configured to execute them from `api-gateway/`.


### Run all tests
```bash
cd api-gateway
npm test
```

### Run tests in watch mode
```bash
cd api-gateway
npm run test:watch
```

### Run tests with coverage
```bash
cd api-gateway
npm run test:coverage
```

## Test Coverage

- **Total test cases**: 270
- **Test files**: 10
- **Test suites**: 10

## Configuration

Jest is configured to:
- Run entrypoints from the repo-root `tests/` directory
- Execute canonical tests under `api-gateway/src/__tests__/` (imported by the entrypoints)
- Collect coverage from `api-gateway/src/`
- Run tests in Node.js environment
- Use TypeScript (ts-jest preset)

See `api-gateway/jest.config.js` for complete configuration.

## CI/CD

All tests are automatically run on every pull request via GitHub Actions workflow:
- Test results are reported in PR checks
- Coverage reports are uploaded as artifacts
- Failed tests will block merge

See `.github/workflows/ci.yml` for CI/CD configuration.
