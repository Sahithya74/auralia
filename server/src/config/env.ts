import { existsSync } from 'node:fs';
import { z } from 'zod';

// Tests configure their own environment (vitest.config.ts) and must never pick up
// the developer's .env, which could point at a real database.
if (!process.env.VITEST && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  COOKIE_SECURE: bool.optional(),

  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CLIENT_DIST_DIR: z.string().optional(),

  AI_PROVIDER: z.enum(['anthropic', 'gemini', 'mock']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  AI_MAX_TOKENS: z.coerce.number().int().min(256).max(64000).default(4096),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).default(60000),
  AI_REFUSAL_FALLBACK: bool.default(true),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  /** Comma-separated backups, each optionally "model:thinking", e.g. "gemini-flash-lite-latest,gemini-3.8-flash:low". */
  GEMINI_FALLBACK_MODELS: z.string().default('gemini-flash-lite-latest'),
  GEMINI_THINKING_LEVEL: z.enum(['minimal', 'low', 'medium', 'high']).default('minimal'),
  GEMINI_HEDGE_MS: z.coerce.number().int().min(500).max(30000).default(2500),
  /** Natural spoken replies via Gemini text-to-speech (needs GEMINI_API_KEY). The browser's voice is the fallback. */
  NATURAL_VOICE: bool.default(true),
  /** Rotated in order: free-tier keys allow only a few speech requests per minute per model. */
  GEMINI_TTS_MODELS: z
    .string()
    .default('gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview'),
  GEMINI_TTS_VOICE: z.string().default('Sulafat'),
  GEMINI_TTS_FIRST_AUDIO_MS: z.coerce.number().int().min(1000).max(30000).default(3500),

  MAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Anbu <no-reply@localhost>'),

  SAFETY_REGION: z.enum(['IN']).default('IN'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid server configuration. Check server/.env:\n${problems}`);
}

const data = parsed.data;

if (data.NODE_ENV === 'production' && data.AI_PROVIDER === 'mock') {
  throw new Error('AI_PROVIDER=mock is for development only and is refused in production.');
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  cookieSecure: data.COOKIE_SECURE ?? data.NODE_ENV === 'production',
};

export type Env = typeof env;
