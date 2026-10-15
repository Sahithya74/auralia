import { Router } from 'express';
import { z } from 'zod';
import { LANGUAGE_CODES } from '../../config/languages.js';
import { prisma } from '../../db.js';
import { currentUserId } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { badRequest, unauthorized } from '../../utils/errors.js';
import { toPublicUser } from './user.view.js';

const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    preferredLanguage: z.enum(LANGUAGE_CODES).optional(),
    interactionMode: z.enum(['VOICE', 'TEXT', 'BOTH']).optional(),
    onboardingCompleted: z.literal(true).optional(),
  })
  .strict();

const updatePreferencesSchema = z
  .object({
    responseStyle: z.enum(['LISTEN', 'SOLUTIONS', 'BALANCED']).optional(),
    codeMixing: z.boolean().optional(),
    voiceOutputEnabled: z.boolean().optional(),
    voiceRate: z.number().min(0.5).max(1.5).optional(),
    voiceGender: z.enum(['FEMALE', 'MALE']).optional(),
    voiceInputReview: z.boolean().optional(),
    captionsEnabled: z.boolean().optional(),
    reducedMotion: z.boolean().optional(),
    textSize: z.enum(['md', 'lg', 'xl']).optional(),
    highContrast: z.boolean().optional(),
    dailyPromptEnabled: z.boolean().optional(),
  })
  .strict();

async function loadMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { preferences: true } });
  if (!user) throw unauthorized();
  return toPublicUser(user);
}

export function usersRoutes(): Router {
  const router = Router();

  router.get('/me', async (req, res) => {
    res.json({ user: await loadMe(currentUserId(req)) });
  });

  router.patch('/me', validateBody(updateMeSchema), async (req, res) => {
    const userId = currentUserId(req);
    const body = req.body as z.infer<typeof updateMeSchema>;
    if (Object.keys(body).length === 0) throw badRequest('NOTHING_TO_UPDATE', 'Nothing to update.');
    const { onboardingCompleted, ...fields } = body;
    await prisma.user.update({
      where: { id: userId },
      data: { ...fields, ...(onboardingCompleted ? { onboardingCompletedAt: new Date() } : {}) },
    });
    res.json({ user: await loadMe(userId) });
  });

  router.patch('/me/preferences', validateBody(updatePreferencesSchema), async (req, res) => {
    const userId = currentUserId(req);
    const body = req.body as z.infer<typeof updatePreferencesSchema>;
    if (Object.keys(body).length === 0) throw badRequest('NOTHING_TO_UPDATE', 'Nothing to update.');
    await prisma.userPreferences.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
    res.json({ user: await loadMe(userId) });
  });

  return router;
}
