# Test Location Strategy

## Overview

Tests are maintained in **two locations** for maximum compatibility with all tools:

```
manoe/
├── tests/                          # Primary location for AI agents and tools
│   ├── *.test.ts                   # All 10 test files (273 cases)
│   └── README.md                    # Test suite documentation
│
└── api-gateway/
    └── src/
        └── __tests__/              # Compatibility location for Tusk
            ├── *.test.ts           # Same test files (duplicated)
            └── (no README)
```

## Why Both Locations?

### Primary Location: `tests/`
- ✅ Standard, discoverable location for AI agents (Qodo, Greptile, etc.)
- ✅ Follows common project conventions
- ✅ Easy to find for new contributors
- ✅ Documented in `tests/README.md`

### Compatibility Location: `api-gateway/src/__tests__/`
- ✅ Legacy tools like Tusk expect tests here
- ✅ CI/CD pipelines may reference this path
- ✅ Maintains backward compatibility

## How It Works

Both locations contain **the same test files**. When you need to update tests:
1. Update files in `tests/` (primary location)
2. Copy changes to `api-gateway/src/__tests__/` for compatibility
3. Or update both locations simultaneously

## Jest Configuration

Jest is configured to run tests from **either** location:

```javascript
module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/tests', '<rootDir>/api-gateway/src'],
  testMatch: ['**/*.test.ts'],
  // ...
};
```

This ensures:
- `npm test` from project root runs tests
- Tests can be run from `api-gateway/` directory
- Both test locations work correctly

## Future Migration

Once all tools (Tusk, etc.) are updated to use the new standard location, the duplicate in `api-gateway/src/__tests__/` can be removed.

## Benefits

- ✅ **AI Agents**: Can discover tests in standard `tests/` location
- ✅ **Tusk**: Continues to work with legacy path
- ✅ **CI/CD**: Works with both GitHub Actions and Tusk
- ✅ **Maintainability**: Clear primary location (`tests/`)
- ✅ **No Breaking Changes**: All existing tools continue to work
