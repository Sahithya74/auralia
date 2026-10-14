import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db.js';
import { errorMeta, logger, setLogLevel } from './utils/logger.js';

setLogLevel(env.LOG_LEVEL);

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info('server.started', {
    port: env.PORT,
    env: env.NODE_ENV,
    aiProvider: env.AI_PROVIDER,
    aiModel: { anthropic: env.ANTHROPIC_MODEL, gemini: env.GEMINI_MODEL, mock: 'mock' }[env.AI_PROVIDER],
  });
  if (env.AI_PROVIDER === 'mock') {
    logger.warn('server.mock_ai', { note: 'AI replies are development mocks, not real conversations.' });
  }
});

// Streaming replies can take a while; don't let Node cut them off.
server.requestTimeout = 0;
server.headersTimeout = 65_000;

async function shutdown(signal: string) {
  logger.info('server.stopping', { signal });
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error('process.unhandled_rejection', errorMeta(err)));
