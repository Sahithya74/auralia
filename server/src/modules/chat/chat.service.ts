import { z } from 'zod';
import { env } from '../../config/env.js';
import { LANGUAGE_CODES } from '../../config/languages.js';
import { prisma } from '../../db.js';
import { resolvePolicy } from '../../persistence/policy.js';
import { buildCompanionPrompt, MOODS } from '../../ai/prompt/companionPrompt.js';
import { assessSafety, type SafetyAssessment } from '../../ai/safety/crisisDetector.js';
import { resourcesFor, type SupportResource } from '../../ai/safety/resources.js';
import { buildSafetyPrompt } from '../../ai/safety/safetyPrompt.js';
import { AIProviderError, type ChatTurn } from '../../ai/types.js';
import { badRequest, unauthorized } from '../../utils/errors.js';

/** Recent turns sent to the model. The client holds the session's context. */
export const MAX_CONTEXT_TURNS = 24;

const turnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(8000),
});

export const chatSchema = z
  .object({
    requestId: z.uuid(),
    conversationId: z.string().min(1).max(40).optional(),
    language: z.enum(LANGUAGE_CODES),
    messages: z.array(turnSchema).min(1).max(80),
    mood: z.enum(MOODS).optional(),
    replacesLast: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.messages.at(-1)?.role === 'user', { path: ['messages'], message: 'Last message must be from the user' })
  .refine((b) => (b.messages.at(-1)?.content.length ?? 0) <= 4000, { path: ['messages'], message: 'Message too long' });

export type ChatRequest = z.infer<typeof chatSchema>;

export interface PreparedChat {
  system: string;
  turns: ChatTurn[];
  language: string;
  userText: string;
  safety: SafetyAssessment & { resources: SupportResource[] };
}

export function contextTurns(messages: ChatTurn[]): ChatTurn[] {
  const recent = messages.slice(-MAX_CONTEXT_TURNS);
  const firstUser = recent.findIndex((t) => t.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

export async function prepareChat(userId: string, body: ChatRequest): Promise<PreparedChat> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      preferences: true,
      memories: {
        where: { enabled: true },
        orderBy: { updatedAt: 'desc' },
        take: 40,
        select: { content: true, kind: true },
      },
    },
  });
  if (!user) throw unauthorized();

  const turns = contextTurns(body.messages);
  const userText = turns.at(-1)?.content;
  if (!userText) throw badRequest('NO_MESSAGE', 'Please write or say something first.');

  const policy = resolvePolicy(user.memoryMode, user.preferences?.historyEnabled ?? false);
  const codeMixing = user.preferences?.codeMixing ?? true;
  const assessment = assessSafety(userText);

  const system =
    assessment.level === 'none'
      ? buildCompanionPrompt({
          language: body.language,
          codeMixing,
          responseStyle: user.preferences?.responseStyle ?? 'BALANCED',
          userName: user.name,
          mood: body.mood,
          memories: policy.memories ? user.memories : undefined,
        })
      : buildSafetyPrompt(assessment, body.language, codeMixing);

  return {
    system,
    turns,
    language: body.language,
    userText,
    safety: { ...assessment, resources: resourcesFor(env.SAFETY_REGION, assessment.categories) },
  };
}

/** Maps provider failures to stable codes the client translates into friendly messages. */
export function clientErrorCode(err: AIProviderError): string {
  switch (err.kind) {
    case 'auth':
    case 'not_configured':
      return 'AI_UNAVAILABLE';
    case 'rate_limit':
    case 'overloaded':
      return 'AI_BUSY';
    case 'timeout':
      return 'AI_TIMEOUT';
    case 'network':
      return 'AI_NETWORK';
    case 'refusal':
      return 'AI_REFUSAL';
    default:
      return 'AI_ERROR';
  }
}

export function asProviderError(err: unknown): AIProviderError {
  return err instanceof AIProviderError ? err : new AIProviderError('unknown', 'Unexpected error.');
}
