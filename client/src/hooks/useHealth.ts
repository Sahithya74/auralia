import { useEffect, useState } from 'react';
import { healthApi } from '../lib/api/endpoints';
import type { Health } from '../lib/api/types';

let cached: Promise<Health | null> | null = null;

/** Server status, used to show the "mock mode" banner when no real AI is configured. */
export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let active = true;
    cached ??= healthApi.get();
    void cached.then((h) => {
      if (!h) cached = null;
      if (active) setHealth(h);
    });
    return () => {
      active = false;
    };
  }, []);
  return health;
}
