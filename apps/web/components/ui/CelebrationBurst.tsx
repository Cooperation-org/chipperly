'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { playCelebrateSound, shouldCelebrate, type CelebrationPlan } from '@/lib/celebrate';
import { useDeviceSettings } from '@/lib/device/settings';
import styles from './CelebrationBurst.module.css';

const STARS = 10;
const BURST_MS = 1000;
const GLOW_MS = 600;

/**
 * A ~1s burst of stars over the screen plus three soft notes, or a still glow under
 * reduced motion. `enabled` is the profile's `celebrations` option. Call `celebrate()`
 * from the tap handler (browsers only start audio from a gesture) and render `layer`
 * once. Never takes input or focus.
 */
export function useCelebrate(enabled: boolean): { celebrate: () => void; layer: ReactElement | null } {
  const device = useDeviceSettings();
  const [plan, setPlan] = useState<CelebrationPlan | null>(null);
  const [run, setRun] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const celebrate = useCallback(() => {
    const systemReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const next = shouldCelebrate({ celebrations: enabled }, device, systemReduced);
    if (next.sound) playCelebrateSound();
    if (!next.burst && !next.glow) return;
    clearTimeout(timer.current);
    setPlan(next);
    setRun((n) => n + 1);
    timer.current = setTimeout(() => setPlan(null), next.burst ? BURST_MS : GLOW_MS);
  }, [enabled, device]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const layer = plan ? (
    <div key={run} className={styles.layer} aria-hidden="true" data-testid="celebration" data-mode={plan.burst ? 'burst' : 'glow'}>
      {plan.burst ? (
        Array.from({ length: STARS }).map((_, i) => (
          <svg key={i} className={styles.star} viewBox="0 0 24 24" style={{ '--i': i } as CSSProperties}>
            <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" />
          </svg>
        ))
      ) : (
        <span className={styles.glow} />
      )}
    </div>
  ) : null;

  return { celebrate, layer };
}
