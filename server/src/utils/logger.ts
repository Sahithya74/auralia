// Structured JSON logger. Conversation content, credentials and contact details are
// never written to logs: any metadata key that could hold them is redacted.

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = new Set(
  [
    'content',
    'messages',
    'text',
    'prompt',
    'system',
    'reply',
    'transcript',
    'body',
    'password',
    'passwordhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'cookie',
    'email',
    'apikey',
  ].map((k) => k.toLowerCase()),
);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

let minLevel: Level = (process.env.LOG_LEVEL as Level | undefined) ?? 'info';
const silent = process.env.VITEST === 'true' && process.env.LOG_IN_TESTS !== 'true';

export function setLogLevel(level: Level): void {
  minLevel = level;
}

function write(level: Level, event: string, meta?: Record<string, unknown>): void {
  if (silent || ORDER[level] < ORDER[minLevel]) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => write('debug', event, meta),
  info: (event: string, meta?: Record<string, unknown>) => write('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => write('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => write('error', event, meta),
};

/** Error details safe to log: type and code, plus stack outside production. */
export function errorMeta(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { errorType: typeof err };
  const meta: Record<string, unknown> = { errorType: err.name };
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') meta.errorCode = code;
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number') meta.status = status;
  if (process.env.NODE_ENV !== 'production') meta.stack = err.stack?.split('\n').slice(0, 6).join('\n');
  return meta;
}
