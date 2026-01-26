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

  // Coverage thresholds - match current test coverage
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 9,
      lines: 10,
      statements: 10,
    },
  },

  verbose: true,
};
