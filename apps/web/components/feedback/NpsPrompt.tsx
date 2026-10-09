'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth/session';
import { setKv, useKv, useKvLoaded } from '@/lib/db/kv';
import { dueNpsMilestone, handledAfter } from '@/lib/feedback/npsPrompt';
import { sendFeedback } from '@/lib/feedback/send';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './NpsPrompt.module.css';

/**
 * "Would you recommend Chipperly?" at 7 and at 21 days after sign-up. Caregiver layout only, never for
 * guests. Shown once per milestone: Not now counts. Goes out as kind `nps` through the feedback endpoint.
 */
export function NpsPrompt() {
  const { user, guest } = useSession();
  const key = `nps_prompt:${user?.id ?? ''}`;
  const handled = useKv<number[]>(key, []);
  const loaded = useKvLoaded(key);
  const path = usePathname();
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  // Read once: the clock must not be read during render.
  const [now] = useState(() => Date.now());

  const milestone = user && !guest && loaded ? dueNpsMilestone(user.created_at, now, handled) : null;
  if (thanks) return <p className={styles.strip} role="status">Thank you.</p>;
  if (milestone === null) return null;

  const done = () => setKv(key, handledAfter(milestone, handled));

  async function send(): Promise<void> {
    if (score === null) return;
    setBusy(true);
    const ok = await sendFeedback({ kind: 'nps', message: reason.trim(), nps_score: score, contact_ok: false, page: (path ?? '/').slice(0, 200), app_version: process.env.NEXT_PUBLIC_GIT_SHA || undefined });
    setBusy(false);
    if (ok) {
      setThanks(true);
      await done();
    } else {
      toast('Could not send that. Check your connection and try again.');
    }
  }

  return (
    <section className={styles.strip} aria-label="A quick question">
      <p className={styles.q}>How likely are you to recommend Chipperly to someone like you?</p>
      <div className={styles.scores} role="group" aria-label="0 is not likely, 10 is very likely">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" className={styles.score} aria-pressed={score === n} onClick={() => setScore(n)}>
            {n}
          </button>
        ))}
      </div>
      {score !== null ? <TextField label="What is the main reason? (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
      <div className={styles.row}>
        <Button onClick={() => void send()} loading={busy} disabled={score === null}>
          Send
        </Button>
        <Button variant="ghost" onClick={() => void done()}>
          Not now
        </Button>
      </div>
    </section>
  );
}
