import type { MemoryMode } from '@prisma/client';

export interface PersistencePolicy {
  mode: MemoryMode;
  /** Conversation transcripts may be stored. */
  transcripts: boolean;
  /** Saved memories may be created or edited. */
  memories: boolean;
}

/**
 * The single definition of what each privacy mode permits.
 *   NONE     - nothing about conversations is stored.
 *   SESSION  - nothing is stored server-side; context lives in the open browser tab only.
 *   PERSONAL - memories the user approves are stored; transcripts only if she turns history on.
 */
export function resolvePolicy(mode: MemoryMode, historyEnabled: boolean): PersistencePolicy {
  return {
    mode,
    transcripts: mode === 'PERSONAL' && historyEnabled,
    memories: mode === 'PERSONAL',
  };
}
