'use client';

import { useSyncExternalStore } from 'react';
import { canSpeak } from './speech';

const noop = () => () => {};

/** canSpeak() that is false in the static HTML and on first hydration, so server and client markup agree. */
export function useCanSpeak(): boolean {
  return useSyncExternalStore(noop, canSpeak, () => false);
}
