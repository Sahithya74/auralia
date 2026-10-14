// THE ONLY MODULE ALLOWED TO WRITE CONVERSATIONS, MESSAGES OR MEMORIES.
//
// Every write re-reads the user's privacy mode inside the same transaction, so a
// stale request, a direct API call or a background job cannot persist anything
// the user has not allowed. tests/unit/architecture.test.ts fails the build if any
// other file calls create/update/upsert on these models or runs raw SQL writes.

import type { MemoryCategory, MemoryKind } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { AppError, notFound } from '../utils/errors.js';
import { resolvePolicy, type PersistencePolicy } from './policy.js';

export const MAX_MEMORIES_PER_USER = 200;

export class PersistenceBlockedError extends AppError {
  constructor(what: string) {
    super(403, 'PERSISTENCE_BLOCKED', `Your privacy settings don't allow saving ${what}.`);
  }
}

async function loadPolicy(tx: Tx, userId: string): Promise<PersistencePolicy> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { memoryMode: true, preferences: { select: { historyEnabled: true } } },
  });
  if (!user) throw notFound();
  return resolvePolicy(user.memoryMode, user.preferences?.historyEnabled ?? false);
}

export function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(oneLine);
  return chars.length <= 60 ? oneLine : chars.slice(0, 57).join('') + '...';
}

export interface ExchangeInput {
  conversationId?: string;
  language: string;
  userText: string;
  assistantText: string;
  userAt: Date;
  assistantAt: Date;
  /** The user corrected her last message (e.g. a speech-recognition mistake). */
  replacesLast?: boolean;
}

export const memoryGate = {
  /**
   * Stores one user/assistant exchange if - and only if - the user's current
   * settings allow transcripts. Returns null when nothing was stored.
   */
  async recordExchange(userId: string, input: ExchangeInput): Promise<{ conversationId: string } | null> {
    return prisma.$transaction(async (tx) => {
      const policy = await loadPolicy(tx, userId);
      if (!policy.transcripts) return null;

      let conversation = input.conversationId
        ? await tx.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true } })
        : null;

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: { userId, language: input.language, title: titleFrom(input.userText) },
          select: { id: true },
        });
      } else if (input.replacesLast) {
        const lastTwo = await tx.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 2,
          select: { id: true },
        });
        await tx.message.deleteMany({ where: { id: { in: lastTwo.map((m) => m.id) } } });
      }

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: input.userText,
          language: input.language,
          createdAt: input.userAt,
        },
      });
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: input.assistantText,
          language: input.language,
          createdAt: input.assistantAt,
        },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { language: input.language } });
      return { conversationId: conversation.id };
    });
  },

  async createMemory(
    userId: string,
    data: { content: string; category: MemoryCategory; kind: MemoryKind; sensitive: boolean },
  ) {
    return prisma.$transaction(async (tx) => {
      const policy = await loadPolicy(tx, userId);
      if (!policy.memories) throw new PersistenceBlockedError('memories');
      const count = await tx.memory.count({ where: { userId } });
      if (count >= MAX_MEMORIES_PER_USER) {
        throw new AppError(409, 'MEMORY_LIMIT', 'You have reached the limit of saved memories. Please remove some first.');
      }
      return tx.memory.create({ data: { userId, ...data } });
    });
  },

  async updateMemory(
    userId: string,
    id: string,
    data: { content?: string; category?: MemoryCategory; enabled?: boolean; sensitive?: boolean },
  ) {
    return prisma.$transaction(async (tx) => {
      const policy = await loadPolicy(tx, userId);
      if (!policy.memories) throw new PersistenceBlockedError('memories');
      const { count } = await tx.memory.updateMany({ where: { id, userId }, data });
      if (count === 0) throw notFound();
      return tx.memory.findFirstOrThrow({ where: { id, userId } });
    });
  },
};
