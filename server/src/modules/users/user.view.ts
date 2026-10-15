import type { User, UserPreferences } from '@prisma/client';
import { resolvePolicy } from '../../persistence/policy.js';

export type UserWithPreferences = User & { preferences: UserPreferences | null };

export const DEFAULT_PREFERENCES = {
  responseStyle: 'BALANCED',
  historyEnabled: false,
  codeMixing: true,
  voiceOutputEnabled: true,
  voiceRate: 1,
  voiceGender: 'FEMALE',
  voiceInputReview: false,
  captionsEnabled: true,
  reducedMotion: false,
  textSize: 'md',
  highContrast: false,
  dailyPromptEnabled: true,
  analyticsConsent: false,
} as const;

/** The only shape in which a user record leaves the server. */
export function toPublicUser(user: UserWithPreferences) {
  const p = user.preferences;
  const preferences = p
    ? {
        responseStyle: p.responseStyle,
        historyEnabled: p.historyEnabled,
        codeMixing: p.codeMixing,
        voiceOutputEnabled: p.voiceOutputEnabled,
        voiceRate: p.voiceRate,
        voiceGender: p.voiceGender,
        voiceInputReview: p.voiceInputReview,
        captionsEnabled: p.captionsEnabled,
        reducedMotion: p.reducedMotion,
        textSize: p.textSize,
        highContrast: p.highContrast,
        dailyPromptEnabled: p.dailyPromptEnabled,
        analyticsConsent: p.analyticsConsent,
      }
    : { ...DEFAULT_PREFERENCES };
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    preferredLanguage: user.preferredLanguage,
    interactionMode: user.interactionMode,
    memoryMode: user.memoryMode,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    createdAt: user.createdAt.toISOString(),
    preferences,
    persistence: resolvePolicy(user.memoryMode, preferences.historyEnabled),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
