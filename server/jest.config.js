'use strict';

/**
 * Backend test runner.
 *
 * `react-scripts test` roots itself at src/ and will not pick these up, so the
 * two suites stay isolated without any extra ignore patterns.
 *
 * There is deliberately no global `setupFilesAfterEnv` for the database: the
 * unit suites (validateUrl, generateCode, linkService) never touch Mongo, and
 * booting mongodb-memory-server for them would cost ~10s per file for nothing.
 * Integration suites opt in by calling `useTestDb()` from test/setupDb.js.
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.js'],
  testTimeout: 60000,
  clearMocks: true,
  restoreMocks: true,
  verbose: false,
};
