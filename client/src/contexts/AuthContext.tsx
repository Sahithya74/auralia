import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { onSessionChange, refreshSession } from '../lib/api/client';
import { authApi, privacyApi, userApi } from '../lib/api/endpoints';
import type { MemoryMode, Preferences, User } from '../lib/api/types';
import { isSupported } from '../lib/i18n/languages';
import { KEYS, session } from '../lib/storage';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<User>;
  register(input: { name: string; email: string; password: string }): Promise<User>;
  logout(): Promise<void>;
  setUser(user: User): void;
  updateUser(changes: Parameters<typeof userApi.update>[0]): Promise<User>;
  updatePreferences(changes: Partial<Preferences>): Promise<User>;
  updatePrivacy(changes: { memoryMode?: MemoryMode; historyEnabled?: boolean; analyticsConsent?: boolean; confirmDeletion?: boolean }): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyDocumentPreferences(user: User | null) {
  const root = document.documentElement;
  const p = user?.preferences;
  root.dataset.textSize = p?.textSize ?? 'md';
  root.dataset.contrast = p?.highContrast ? 'high' : 'normal';
  root.dataset.reducedMotion = p?.reducedMotion ? 'true' : 'false';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const { i18n } = useTranslation();

  const setUser = useCallback(
    (next: User | null) => {
      setUserState(next);
      applyDocumentPreferences(next);
      if (next && isSupported(next.preferredLanguage) && i18n.language !== next.preferredLanguage) {
        void i18n.changeLanguage(next.preferredLanguage);
      }
    },
    [i18n],
  );

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((s) => {
        if (cancelled) return;
        setUser(s?.user ?? null);
        setStatus(s ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    const unsubscribe = onSessionChange((s) => {
      if (!s) {
        setUser(null);
        setStatus('anonymous');
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async login(email, password) {
        const s = await authApi.login({ email, password });
        setUser(s.user);
        setStatus('authenticated');
        return s.user;
      },
      async register(input) {
        const s = await authApi.register({ ...input, preferredLanguage: i18n.language });
        setUser(s.user);
        setStatus('authenticated');
        return s.user;
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
          // Signing out locally still matters if the network call fails.
        }
        session.clearPrefix(KEYS.conversationPrefix);
        setUser(null);
        setStatus('anonymous');
      },
      setUser: (u) => setUser(u),
      async updateUser(changes) {
        const u = await userApi.update(changes);
        setUser(u);
        return u;
      },
      async updatePreferences(changes) {
        const u = await userApi.updatePreferences(changes);
        setUser(u);
        return u;
      },
      async updatePrivacy(changes) {
        await privacyApi.update(changes);
        setUser(await userApi.me());
      },
    }),
    [status, user, setUser, i18n.language],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For screens that only render when signed in. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires an authenticated user');
  return user;
}
