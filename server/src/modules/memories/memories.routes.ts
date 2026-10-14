import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { currentUserId } from '../../middleware/auth.js';
import { parseParams, validateBody } from '../../middleware/validate.js';
import { memoryGate } from '../../persistence/memoryGate.js';
import { badRequest, notFound } from '../../utils/errors.js';

export const MEMORY_CATEGORIES = ['PREFERENCE', 'PEOPLE', 'ROUTINE', 'WELLBEING', 'GOAL', 'OTHER'] as const;

const idParams = z.object({ id: z.string().min(1).max(40) });

const createSchema = z
  .object({
    content: z.string().trim().min(1).max(500),
    category: z.enum(MEMORY_CATEGORIES).default('OTHER'),
    kind: z.enum(['STATED', 'INTERPRETATION']).default('STATED'),
    sensitive: z.boolean().default(false),
  })
  .strict();

const updateSchema = z
  .object({
    content: z.string().trim().min(1).max(500).optional(),
    category: z.enum(MEMORY_CATEGORIES).optional(),
    enabled: z.boolean().optional(),
    sensitive: z.boolean().optional(),
  })
  .strict();

const memorySelect = {
  id: true,
  content: true,
  category: true,
  kind: true,
  sensitive: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

function view<T extends Record<keyof typeof memorySelect, unknown>>(m: T) {
  const { id, content, category, kind, sensitive, enabled, createdAt, updatedAt } = m;
  return { id, content, category, kind, sensitive, enabled, createdAt, updatedAt };
}

export function memoriesRoutes(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const memories = await prisma.memory.findMany({
      where: { userId: currentUserId(req) },
      orderBy: { createdAt: 'desc' },
      select: memorySelect,
    });
    res.json({ memories });
  });

  router.post('/', validateBody(createSchema), async (req, res) => {
    const memory = await memoryGate.createMemory(currentUserId(req), req.body);
    res.status(201).json({ memory: view(memory) });
  });

  router.patch('/:id', validateBody(updateSchema), async (req, res) => {
    const { id } = parseParams(idParams, req);
    if (Object.keys(req.body).length === 0) throw badRequest('NOTHING_TO_UPDATE', 'Nothing to update.');
    const memory = await memoryGate.updateMemory(currentUserId(req), id, req.body);
    res.json({ memory: view(memory) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = parseParams(idParams, req);
    const { count } = await prisma.memory.deleteMany({ where: { id, userId: currentUserId(req) } });
    if (count === 0) throw notFound();
    res.status(204).end();
  });

  router.delete('/', async (req, res) => {
    const { count } = await prisma.memory.deleteMany({ where: { userId: currentUserId(req) } });
    res.json({ deleted: count });
  });

  return router;
}
