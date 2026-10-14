import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { currentUserId } from '../../middleware/auth.js';
import { parseParams } from '../../middleware/validate.js';
import { resolvePolicy } from '../../persistence/policy.js';
import { forbidden, notFound, unauthorized } from '../../utils/errors.js';

const idParams = z.object({ id: z.string().min(1).max(40) });

export function conversationsRoutes(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const userId = currentUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { memoryMode: true, preferences: { select: { historyEnabled: true } } },
    });
    if (!user) throw unauthorized();
    if (!resolvePolicy(user.memoryMode, user.preferences?.historyEnabled ?? false).transcripts) {
      throw forbidden('HISTORY_DISABLED', 'Conversation history is turned off in your privacy settings.');
    }
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, language: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
    });
    res.json({
      conversations: conversations.map(({ _count, ...c }) => ({ ...c, messageCount: _count.messages })),
    });
  });

  router.get('/:id', async (req, res) => {
    const { id } = parseParams(idParams, req);
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: currentUserId(req) },
      select: {
        id: true,
        title: true,
        language: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, role: true, content: true, language: true, createdAt: true },
        },
      },
    });
    if (!conversation) throw notFound();
    res.json({ conversation });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = parseParams(idParams, req);
    const { count } = await prisma.conversation.deleteMany({ where: { id, userId: currentUserId(req) } });
    if (count === 0) throw notFound();
    res.status(204).end();
  });

  router.delete('/', async (req, res) => {
    const { count } = await prisma.conversation.deleteMany({ where: { userId: currentUserId(req) } });
    res.json({ deleted: count });
  });

  return router;
}
