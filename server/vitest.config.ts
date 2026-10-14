import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Only TEST_DATABASE_URL is taken from server/.env; everything else is fixed here so
// tests never touch the development database or a real AI provider.
const fileEnv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL ?? '';
// globalSetup runs in this process, not in the test workers that receive `test.env`.
if (testDatabaseUrl) process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: testDatabaseUrl,
      DATABASE_URL: testDatabaseUrl || 'mysql://unset:unset@127.0.0.1:1/unset_test',
      JWT_ACCESS_SECRET: 'test-only-secret-test-only-secret-0123456789',
      AI_PROVIDER: 'mock',
      BCRYPT_ROUNDS: '4',
      MAIL_TRANSPORT: 'console',
      COOKIE_SECURE: 'false',
      LOG_LEVEL: 'error',
    },
  },
});
