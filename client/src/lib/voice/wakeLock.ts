// Keeps the phone screen on during a hands-free conversation. Nobody touches the
// screen while talking, so it would otherwise turn off after the usual timeout and
// the conversation would pause. Browsers drop the lock when the page is hidden, so
// it is requested again whenever the page is visible and still wanted.

interface Sentinel {
  released?: boolean;
  release(): Promise<void>;
}

type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> };

let sentinel: Sentinel | null = null;
let wanted = false;

function api(): WakeLockApi | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

export async function keepScreenOn(on: boolean): Promise<void> {
  wanted = on;
  if (!on) {
    const current = sentinel;
    sentinel = null;
    await current?.release().catch(() => undefined);
    return;
  }
  const wakeLock = api();
  if (!wakeLock || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
  try {
    const lock = await wakeLock.request('screen');
    if (wanted) sentinel = lock;
    else await lock.release();
  } catch {
    // Not allowed here (e.g. battery saver); the conversation still works.
    sentinel = null;
  }
}
