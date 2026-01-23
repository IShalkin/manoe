# Test Location Strategy

## Overview

Tests are maintained in **two locations** to balance discoverability (AI tools) with dependency locality (Node/TypeScript):

```text
manoe/
├── tests/                          # Entrypoints for AI tools
│   ├── *.test.ts                   # Thin imports of api-gateway/src/__tests__ (10 files, 270 cases)
│   ├── README.md                   # Test suite documentation
│   └── LOCATION_STRATEGY.md        # This document
│
└── api-gateway/
    └── src/
        └── __tests__/              # Canonical test implementations (with correct relative imports)
            └── *.test.ts
```

## Why Both Locations?

### Entrypoints: `tests/`
- ✅ Standard, discoverable location for AI agents (Qodo, Greptile, etc.)
- ✅ Keeps repo-root visibility without duplicating test logic
- ✅ Points to canonical implementations under `api-gateway/src/__tests__/`

### Canonical Tests: `api-gateway/src/__tests__/`
- ✅ Lives inside the Node package that owns the dependencies (`api-gateway/node_modules/`)
- ✅ Keeps relative imports stable (`../services/*`, etc.)
- ✅ Preserves compatibility with tools that expect this path

## How It Works

- Each file in `tests/` is a thin wrapper that imports the corresponding file in `api-gateway/src/__tests__/`.
- Make test changes in `api-gateway/src/__tests__/`. The wrappers in `tests/` should rarely change (mostly when adding/removing test files).

## Jest Configuration

Jest is run from `api-gateway/` (where `node_modules/` lives) but executes tests from the repo-root `tests/` directory:

```javascript
module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/../tests'],
  modulePaths: ['<rootDir>/node_modules'],
  testMatch: ['**/*.test.ts'],
  // ...
};
```

## Future Migration

If the repo is later converted to a true monorepo with root-level dependencies, the canonical tests can move to `tests/` and the thin wrappers can be removed.

## Benefits

- ✅ **AI Agents**: Can discover tests in standard `tests/` location
- ✅ **Tusk**: Continues to work with legacy path
- ✅ **CI/CD**: Works with both GitHub Actions and Tusk
- ✅ **Maintainability**: Single source of truth (no duplicated test logic)
- ✅ **No Breaking Changes**: All existing tools continue to work
