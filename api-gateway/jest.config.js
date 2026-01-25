module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,

  // Tests are co-located in src/__tests__/
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],

  moduleFileExtensions: ['ts', 'js', 'json'],

  // Setup files for shared mocks
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  // Coverage configuration with thresholds
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Coverage thresholds - enforce 60% minimum coverage
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },

  verbose: true,
};
