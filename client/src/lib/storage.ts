// Browser storage can be unavailable (private mode, blocked site data), so every
// access is guarded. Only non-sensitive conveniences use localStorage; session
// conversation context uses sessionStorage, which the browser clears with the tab.

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const local = {
  get: (key: string) => safe(() => window.localStorage.getItem(key), null),
  set: (key: string, value: string) => safe(() => window.localStorage.setItem(key, value), undefined),
  remove: (key: string) => safe(() => window.localStorage.removeItem(key), undefined),
};

export const session = {
  get: (key: string) => safe(() => window.sessionStorage.getItem(key), null),
  set: (key: string, value: string) => safe(() => window.sessionStorage.setItem(key, value), undefined),
  remove: (key: string) => safe(() => window.sessionStorage.removeItem(key), undefined),
  clearPrefix: (prefix: string) =>
    safe(() => {
      for (const key of Object.keys(window.sessionStorage)) if (key.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }, undefined),
};

export const KEYS = {
  uiLanguage: 'anbu.uiLanguage',
  dailyPromptDismissed: 'anbu.dailyPromptDismissed',
  showTiming: 'anbu.showTiming',
  conversationPrefix: 'anbu.conversation.',
} as const;
