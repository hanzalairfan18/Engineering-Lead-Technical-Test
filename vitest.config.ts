import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The full-app HTTP test boots Fastify; allow a generous default.
    testTimeout: 10_000,
    // Tests use a synthetic OPENAI_API_KEY so config validation passes
    // without a real network credential.
    env: {
      OPENAI_API_KEY: 'sk-test-key-not-real',
      LOG_LEVEL: 'silent',
    },
  },
});
