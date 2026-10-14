import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { currentUserId } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { badRequest, unauthorized } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { verifyPassword } from '../auth/password.js';
import { clearRefreshCookie } from '../auth/cookies.js';
import { getPrivacySettings, updatePrivacySettings } from './privacy.service.js';

const updateSchema = z
  .object({
    memoryMode: z.enum(['NONE', 'SESSION', 'PERSONAL']).optional(),
    historyEnabled: z.boolean().optional(),
    analyticsConsent: z.boolean().optional(),
    confirmDeletion: z.boolean().optional(),
  })
  .strict();

const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

export function privacyRoutes(): Router {
  const router = Router();

  router.get('/settings', async (req, res) => {
    res.json(await getPrivacySettings(currentUserId(req)));
  });

  router.patch('/settings', validateBody(updateSchema), async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const { confirmDeletion: _confirm, ...changes } = body;
    if (Object.keys(changes).length === 0) throw badRequest('NOTHING_TO_UPDATE', 'Nothing to update.');
    res.json(await updatePrivacySettings(currentUserId(req), body));
  });

  return router;
}

export function accountRoutes(): Router {
  const router = Router();

  router.post('/export', async (req, res) => {
    const userId = currentUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
        interactionMode: true,
        memoryMode: true,
        onboardingCompletedAt: true,
        createdAt: true,
        preferences: { omit: { userId: true } },
        memories: { orderBy: { createdAt: 'asc' }, omit: { userId: true } },
        conversations: {
          orderBy: { createdAt: 'asc' },
          omit: { userId: true },
          include: { messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], omit: { conversationId: true } } },
        },
      },
    });
    if (!user) throw unauthorized();
    logger.info('account.exported', { userId });
    res.setHeader('Content-Disposition', `attachment; filename="anbu-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ exportedAt: new Date().toISOString(), format: 'anbu-export-v1', account: user });
  });

  router.delete('/', validateBody(deleteAccountSchema), async (req, res) => {
    const userId = currentUserId(req);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw unauthorized();
    if (!(await verifyPassword(req.body.password, user.passwordHash))) {
      throw unauthorized('INVALID_PASSWORD', 'That password is not correct.');
    }
    // Cascades to preferences, conversations, messages, memories and tokens.
    await prisma.user.delete({ where: { id: userId } });
    logger.info('account.deleted', { userId });
    clearRefreshCookie(res);
    res.status(204).end();
  });

  return router;
}
