module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,

  // Tests are stored at repo root, but dependencies are installed in api-gateway/
  roots: ['<rootDir>/../tests'],
  testMatch: ['**/*.test.ts'],

  // Ensure Node can resolve packages from api-gateway/node_modules for root-level tests
  modulePaths: ['<rootDir>/node_modules'],

  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
};
