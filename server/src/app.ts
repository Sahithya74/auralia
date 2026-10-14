import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { createProviderFromEnv, createSpeechFromEnv, type AIProvider } from './ai/index.js';
import type { GeminiSpeech } from './ai/speech/geminiSpeech.js';
import { env } from './config/env.js';
import { LANGUAGES } from './config/languages.js';
import { prisma } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { chatRoutes } from './modules/chat/chat.routes.js';
import { conversationsRoutes } from './modules/conversations/conversations.routes.js';
import { memoriesRoutes } from './modules/memories/memories.routes.js';
import { accountRoutes, privacyRoutes } from './modules/privacy/privacy.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { voiceRoutes } from './modules/voice/voice.routes.js';

export interface AppDependencies {
  ai?: AIProvider;
  /** null turns natural voice off; undefined reads it from the environment. */
  speech?: GeminiSpeech | null;
}

export function createApp(deps: AppDependencies = {}) {
  const ai = deps.ai ?? createProviderFromEnv();
  const speech = deps.speech === undefined ? createSpeechFromEnv() : deps.speech;
  const limiters = createRateLimiters();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  // HTTPS-only headers would break `npm start` on plain http://localhost.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: env.isProduction ? [] : null } },
      strictTransportSecurity: env.isProduction,
    }),
  );
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(requestLogger);
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  const api = Router();

  api.get('/health', async (_req, res) => {
    let database: 'ok' | 'unavailable' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      ai: { provider: ai.name, mock: ai.isMock },
      voice: { natural: speech !== null },
      languages: LANGUAGES.map((l) => l.code),
    });
  });

  api.use('/auth', authRoutes(limiters));

  const protectedApi = Router();
  protectedApi.use(requireAuth, limiters.api);
  protectedApi.use('/users', usersRoutes());
  protectedApi.use('/chat', chatRoutes(ai, limiters));
  protectedApi.use('/voice', voiceRoutes(speech, limiters));
  protectedApi.use('/conversations', conversationsRoutes());
  protectedApi.use('/memories', memoriesRoutes());
  protectedApi.use('/privacy', privacyRoutes());
  protectedApi.use('/account', accountRoutes());
  api.use(protectedApi);

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', api);
  app.use('/api', notFoundHandler);

  // In production the API also serves the built PWA from the same origin.
  const clientDist =
    env.CLIENT_DIST_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.isProduction && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
