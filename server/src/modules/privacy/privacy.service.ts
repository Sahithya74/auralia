import type { MemoryMode } from '@prisma/client';
import { prisma } from '../../db.js';
import { resolvePolicy } from '../../persistence/policy.js';
import { conflict, unauthorized } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface PrivacyUpdate {
  memoryMode?: MemoryMode;
  historyEnabled?: boolean;
  analyticsConsent?: boolean;
  confirmDeletion?: boolean;
}

export async function getPrivacySettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { memoryMode: true, preferences: { select: { historyEnabled: true, analyticsConsent: true } } },
  });
  if (!user) throw unauthorized();
  const [conversations, memories] = await Promise.all([
    prisma.conversation.count({ where: { userId } }),
    prisma.memory.count({ where: { userId } }),
  ]);
  const historyEnabled = user.preferences?.historyEnabled ?? false;
  return {
    memoryMode: user.memoryMode,
    historyEnabled,
    analyticsConsent: user.preferences?.analyticsConsent ?? false,
    persistence: resolvePolicy(user.memoryMode, historyEnabled),
    stored: { conversations, memories },
  };
}

/**
 * Changing to a mode that no longer permits stored data deletes that data in the
 * same transaction, so "No memory" really means nothing is kept. The client must
 * pass confirmDeletion once the user has seen what will be removed.
 */
export async function updatePrivacySettings(userId: string, update: PrivacyUpdate) {
  const current = await getPrivacySettings(userId);
  const memoryMode = update.memoryMode ?? current.memoryMode;
  const historyEnabled = update.historyEnabled ?? current.historyEnabled;
  const next = resolvePolicy(memoryMode, historyEnabled);

  const deleteConversations = !next.transcripts && current.stored.conversations > 0;
  const deleteMemories = !next.memories && current.stored.memories > 0;

  if ((deleteConversations || deleteMemories) && !update.confirmDeletion) {
    throw conflict('CONFIRM_DELETION', 'This change will delete saved data. Please confirm.', {
      conversations: deleteConversations ? current.stored.conversations : 0,
      memories: deleteMemories ? current.stored.memories : 0,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (deleteConversations) await tx.conversation.deleteMany({ where: { userId } });
    if (deleteMemories) await tx.memory.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { memoryMode } });
    await tx.userPreferences.upsert({
      where: { userId },
      update: {
        historyEnabled,
        ...(update.analyticsConsent !== undefined ? { analyticsConsent: update.analyticsConsent } : {}),
      },
      create: { userId, historyEnabled, analyticsConsent: update.analyticsConsent ?? false },
    });
  });

  if (deleteConversations || deleteMemories) {
    logger.info('privacy.data_deleted_on_mode_change', { userId, memoryMode, deleteConversations, deleteMemories });
  }
  return getPrivacySettings(userId);
}
