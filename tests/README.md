# MANOE Test Suite

This directory contains the complete test suite for the MANOE Multi-Agent Narrative Orchestration Engine.

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

- **Total test cases**: 273
- **Test files**: 10
- **Test suites**: 80

## Configuration

Jest is configured to:
- Find tests in `tests/` directory
- Collect coverage from `api-gateway/src/`
- Run tests in Node.js environment
- Use TypeScript (ts-jest preset)

See `jest.config.js` for complete configuration.

## CI/CD

All tests are automatically run on every pull request via GitHub Actions workflow:
- Test results are reported in PR checks
- Coverage reports are uploaded as artifacts
- Failed tests will block merge

See `.github/workflows/ci.yml` for CI/CD configuration.
