# Documentation Updates - January 23, 2026

## Changes Made

### 1. Test Relocation

**Problem:** Tests were hidden in `api-gateway/src/__tests__/`, causing AI agents to not detect them.

**Solution:** Moved all 10 test files (273 test cases) to root `tests/` directory.

**Files Changed:**
- `tests/` - New directory with all test files
- `api-gateway/src/__tests__/` - Removed
- `api-gateway/jest.config.js` - Updated to scan `tests/` directory
- `tests/README.md` - Added comprehensive test documentation

### 2. Documentation Updates

#### ACHIEVEMENT.md
- Fixed test count: 273 test cases (not 270)
- Added "Testing" section with accurate numbers
- Updated tool name: "grep-tail" → "greptile"
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

```
manoe/
├── tests/                          # NEW: All test files here
│   ├── cors.test.ts
│   ├── CriticAgent.test.ts
│   ├── EvaluationService.test.ts
│   └── ... (7 more test files)
│   └── README.md
├── api-gateway/
│   ├── src/                        # Source code
│   │   ├── agents/
│   │   ├── services/
│   │   └── ...
│   └── jest.config.js              # UPDATED: Scans tests/
├── README.md                       # UPDATED: Accurate info
├── ACHIEVEMENT.md                 # UPDATED: Fixed all metrics
└── ...
```

## Benefits

1. **AI Agent Compatibility:** Tests are now in standard `tests/` location
2. **Better Discoverability:** Tools can easily find and analyze tests
3. **Accurate Documentation:** All numbers and claims are verified
4. **Generalizable:** Removed deployment-specific URLs
5. **Clear Structure:** Test documentation explains setup and usage

## Verification

- ✅ 10 test files in `tests/`
- ✅ 273 test cases total
- ✅ Jest configured correctly
- ✅ No outdated test directories
- ✅ All documentation updated
- ✅ Tool names corrected (greptile, Qodo)
