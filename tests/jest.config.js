module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/tests', '<rootDir>/api-gateway/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'api-gateway/src/**/*.ts',
    '!api-gateway/src/**/*.d.ts',
    '!api-gateway/src/index.ts',
  ],
  coverageDirectory: 'api-gateway/coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
};
