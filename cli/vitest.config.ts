import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    // Required while the test suite is being built up incrementally — without
    // this, vitest exits 1 when no test files match. Remove only after the
    // test suite is stable and "no tests" should mean a glob misconfiguration.
    passWithNoTests: true,
  },
});
