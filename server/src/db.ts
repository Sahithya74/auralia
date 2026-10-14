import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger.js';

// Prisma's messages can include query details, so only the source is logged.
// Query logging stays off: queries carry message content as parameters.
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e) => logger.error('prisma.error', { target: e.target }));
prisma.$on('warn', (e) => logger.warn('prisma.warn', { target: e.target }));

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
