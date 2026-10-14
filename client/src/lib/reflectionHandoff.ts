import type { ChatTurn } from './api/types';

export interface ReflectionData {
  messages: ChatTurn[];
  language: string;
}

// Passed in page memory rather than router state: browsers keep router state in
// the tab's history (and restore it after reloads), which would retain the
// transcript even in No-memory mode.
let pending: ReflectionData | null = null;

export const reflectionHandoff = {
  set(data: ReflectionData) {
    pending = data;
  },
  get(): ReflectionData | null {
    return pending;
  },
  clear() {
    pending = null;
  },
};
