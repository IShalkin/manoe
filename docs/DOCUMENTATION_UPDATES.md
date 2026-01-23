# Documentation Updates - January 23, 2026

## Changes Made

### 1. Test Relocation

**Problem:** Tests were hidden in `api-gateway/src/__tests__/`, causing AI agents to not detect them.

**Solution:** Added a repo-root `tests/` directory with thin test entrypoints for AI tooling, while keeping the canonical test implementations in `api-gateway/src/__tests__/`.

**Files Changed:**
- `tests/` - New directory with test entrypoints and documentation
- `api-gateway/src/__tests__/` - Canonical test implementations (kept inside the Node package)
- `api-gateway/jest.config.js` - Updated to execute entrypoints from `../tests`
- `api-gateway/package.json` - Updated lint scripts to include `../tests`
- `tests/README.md` / `tests/LOCATION_STRATEGY.md` - Added documentation

### 2. Documentation Updates

#### ACHIEVEMENT.md
- Fixed test count: 270 test cases
- Added "Testing" section with accurate numbers
- Updated tool name: "grep-tail" → "Greptile"
- Added detailed test structure explanation

#### README.md
- Removed production-specific URLs (iliashalkin.com references)
- Fixed line count: ~23,000 lines (not 105k+)
- Removed deprecated Python orchestrator references
- Added "Testing & Code Quality" section
- Updated all mentions of CI/CD to reflect actual test status
- Added production status badges

#### docker-compose.yml
- Removed deprecated Python orchestrator note
- Clarified production vs local deployment

### 3. New Documentation

#### tests/README.md
- Complete test suite documentation
- Instructions for running tests
- Test structure overview
- CI/CD integration details

## Final Structure

```text
manoe/
├── tests/                          # Test entrypoints (repo root)
│   ├── *.test.ts
│   ├── README.md
│   └── LOCATION_STRATEGY.md
├── api-gateway/
│   ├── src/
│   │   ├── __tests__/              # Canonical test implementations
│   │   └── ...
│   ├── jest.config.js              # Executes entrypoints from ../tests
│   └── package.json                # Contains test/lint scripts
├── README.md
├── ACHIEVEMENT.md
└── ...
```

## Benefits

1. **AI Agent Compatibility:** Tests are now in standard `tests/` location
2. **Backwards compatibility:** Legacy tooling can continue using `api-gateway/src/__tests__/`
3. **Clear developer workflow:** Edit tests in `api-gateway/src/__tests__/`; repo-root `tests/` are thin entrypoints
4. **Accurate Documentation:** All numbers and claims are verified
5. **Generalizable:** Removed deployment-specific URLs

## Verification

- ✅ 10 test entrypoint files in `tests/`
- ✅ 270 test cases total
- ✅ Jest runs from `api-gateway/` and executes entrypoints from `tests/`
