import { api, setAccessToken } from './client';
import type {
  ChatTurn,
  ConversationDetail,
  ConversationSummary,
  Health,
  Memory,
  MemoryCategory,
  MemoryKind,
  MemoryMode,
  MemorySuggestion,
  Preferences,
  PrivacySettings,
  SessionResponse,
  User,
} from './types';

async function startSession(path: string, body: unknown): Promise<SessionResponse> {
  const session = await api<SessionResponse>(path, { method: 'POST', body });
  setAccessToken(session.accessToken);
  return session;
}

export const authApi = {
  register: (body: { name: string; email: string; password: string; preferredLanguage?: string }) =>
    startSession('/auth/register', body),
  login: (body: { email: string; password: string }) => startSession('/auth/login', body),
  logout: async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
    }
  },
  forgotPassword: (email: string) => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, password: string) =>
    api<{ message: string }>('/auth/reset-password', { method: 'POST', body: { token, password } }),
};

export const userApi = {
  me: () => api<{ user: User }>('/users/me').then((r) => r.user),
  update: (body: Partial<Pick<User, 'name' | 'preferredLanguage' | 'interactionMode'>> & { onboardingCompleted?: true }) =>
    api<{ user: User }>('/users/me', { method: 'PATCH', body }).then((r) => r.user),
  updatePreferences: (body: Partial<Omit<Preferences, 'historyEnabled' | 'analyticsConsent'>>) =>
    api<{ user: User }>('/users/me/preferences', { method: 'PATCH', body }).then((r) => r.user),
};

export const privacyApi = {
  get: () => api<PrivacySettings>('/privacy/settings'),
  update: (body: { memoryMode?: MemoryMode; historyEnabled?: boolean; analyticsConsent?: boolean; confirmDeletion?: boolean }) =>
    api<PrivacySettings>('/privacy/settings', { method: 'PATCH', body }),
  exportData: () => api<unknown>('/account/export', { method: 'POST' }),
  deleteAccount: (password: string) => api<void>('/account', { method: 'DELETE', body: { password } }),
};

export const memoryApi = {
  list: () => api<{ memories: Memory[] }>('/memories').then((r) => r.memories),
  create: (body: { content: string; category?: MemoryCategory; kind?: MemoryKind; sensitive?: boolean }) =>
    api<{ memory: Memory }>('/memories', { method: 'POST', body }).then((r) => r.memory),
  update: (id: string, body: Partial<Pick<Memory, 'content' | 'category' | 'enabled' | 'sensitive'>>) =>
    api<{ memory: Memory }>(`/memories/${encodeURIComponent(id)}`, { method: 'PATCH', body }).then((r) => r.memory),
  remove: (id: string) => api<void>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  removeAll: () => api<{ deleted: number }>('/memories', { method: 'DELETE' }),
};

export const conversationApi = {
  list: () => api<{ conversations: ConversationSummary[] }>('/conversations').then((r) => r.conversations),
  get: (id: string) =>
    api<{ conversation: ConversationDetail }>(`/conversations/${encodeURIComponent(id)}`).then((r) => r.conversation),
  remove: (id: string) => api<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  removeAll: () => api<{ deleted: number }>('/conversations', { method: 'DELETE' }),
};

export const reflectApi = {
  text: (kind: 'summary' | 'next_step', language: string, messages: ChatTurn[]) =>
    api<{ text: string; ai: { mock: boolean } }>('/chat/reflect', { method: 'POST', body: { kind, language, messages } }),
  memorySuggestions: (language: string, messages: ChatTurn[]) =>
    api<{ suggestions: MemorySuggestion[]; ai: { mock: boolean } }>('/chat/reflect', {
      method: 'POST',
      body: { kind: 'memory_suggestions', language, messages },
    }),
};

export const healthApi = {
  get: async (): Promise<Health | null> => {
    try {
      const res = await fetch('/api/health');
      return (await res.json()) as Health;
    } catch {
      return null;
    }
  },
};
