import type { SessionResponse } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly fields?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The access token lives only in memory. The refresh token is an httpOnly cookie
// the page cannot read; it restores the session after a reload.
let accessToken: string | null = null;
let refreshInFlight: Promise<SessionResponse | null> | null = null;
const sessionListeners = new Set<(session: SessionResponse | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionChange(listener: (session: SessionResponse | null) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSession(session: SessionResponse | null) {
  for (const listener of sessionListeners) listener(session);
}

export const BASE_HEADERS = { 'X-Anbu-Client': 'web' } as const;

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown>; fields?: string[] };
    };
    return new ApiError(
      res.status,
      body.error?.code ?? 'HTTP_' + res.status,
      body.error?.message ?? 'Request failed',
      body.error?.details,
      body.error?.fields,
    );
  } catch {
    return new ApiError(res.status, 'HTTP_' + res.status, 'Request failed');
  }
}

async function doRefresh(): Promise<SessionResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch('/api/auth/refresh', { method: 'POST', headers: BASE_HEADERS, credentials: 'same-origin' });
    } catch {
      throw new ApiError(0, 'NETWORK', 'You seem to be offline.');
    }
    if (res.ok) {
      const session = (await res.json()) as SessionResponse;
      accessToken = session.accessToken;
      emitSession(session);
      return session;
    }
    const err = await readError(res);
    // Another tab rotated the cookie a moment ago; the browser now holds the new one.
    if (err.code === 'REFRESH_RACE' && attempt === 0) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    break;
  }
  accessToken = null;
  emitSession(null);
  return null;
}

/** Single-flight: concurrent 401s share one refresh request. */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export function authHeaders(): Record<string, string> {
  return { ...BASE_HEADERS, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
}

export async function apiFetch(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: { ...authHeaders(), ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'You seem to be offline.');
  }
  if (res.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return apiFetch(path, options, false);
  }
  return res;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { readError };
