'use client';

import { useId, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { FeedbackKind } from '@chipperly/shared/schemas/feedback';
import { buildFeedbackBody, sendFeedback, type FeedbackDraft } from '@/lib/feedback/send';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/lib/toast';
import styles from './FeedbackForm.module.css';

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'bug', label: 'Broken' },
  { value: 'idea', label: 'Idea' },
  { value: 'question', label: 'Question' },
  { value: 'love', label: 'Love it' },
];

const PROMPT: Record<FeedbackKind, string> = {
  bug: 'What went wrong? What did you expect to happen?',
  idea: 'What would make Chipperly better for you?',
  question: 'What would you like to know?',
  love: 'What is working well for you?',
};

const EMPTY: FeedbackDraft = { kind: 'idea', message: '', rating: null, contactOk: false, contactEmail: '', bargain: '', expensive: '', tooExpensive: '' };

/** Settings > Send feedback. Works for guests too; nothing about their routines or children is attached. */
export function FeedbackForm() {
  const router = useRouter();
  const path = usePathname();
  const { user, guest } = useSession();
  const [draft, setDraft] = useState<FeedbackDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const messageId = useId();
  const set = <K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(): Promise<void> {
    setBusy(true);
    const ok = await sendFeedback(buildFeedbackBody(draft, path ?? '/', process.env.NEXT_PUBLIC_GIT_SHA || undefined));
    setBusy(false);
    if (ok) setSent(true);
    else toast('Could not send that. Check your connection and try again.');
  }

  if (sent) {
    return (
      <section className={styles.card} role="status">
        <h2 className={styles.title}>Thank you</h2>
        <p className={styles.muted}>We read every message.{draft.contactOk ? ' If we have a question, we will write to you.' : ''}</p>
        <Button onClick={() => router.back()}>Done</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(EMPTY);
            setSent(false);
          }}
        >
          Send another
        </Button>
      </section>
    );
  }

  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className={styles.muted}>Chipperly is in beta. What you tell us here goes straight to the team.</p>
      <Segmented label="What kind of feedback is this?" items={KINDS} value={draft.kind} onChange={(v) => set('kind', v as FeedbackKind)} />
      <Field label={PROMPT[draft.kind]} htmlFor={messageId}>
        <textarea id={messageId} className={styles.textarea} rows={6} maxLength={4000} required value={draft.message} onChange={(e) => set('message', e.target.value)} />
      </Field>

      <fieldset className={styles.rating}>
        <legend>How is Chipperly working for you? (optional)</legend>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={styles.star} aria-pressed={draft.rating === n} aria-label={`${n} of 5`} onClick={() => set('rating', draft.rating === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>
        <span className={styles.hint}>1 is not working, 5 is working great</span>
      </fieldset>

      <details className={styles.pricing}>
        <summary>Help us set a fair price (optional)</summary>
        <p className={styles.muted}>Whole dollars per month, for one person. There are no wrong answers.</p>
        <TextField label="At what price would Chipperly be a bargain?" inputMode="numeric" value={draft.bargain} onChange={(e) => set('bargain', e.target.value)} />
        <TextField label="At what price is it getting expensive, but you would still think about it?" inputMode="numeric" value={draft.expensive} onChange={(e) => set('expensive', e.target.value)} />
        <TextField label="At what price is it too expensive to consider?" inputMode="numeric" value={draft.tooExpensive} onChange={(e) => set('tooExpensive', e.target.value)} />
      </details>

      <label className={styles.check}>
        <input type="checkbox" checked={draft.contactOk} onChange={(e) => set('contactOk', e.target.checked)} />
        <span>You may write back to me about this</span>
      </label>
      {draft.contactOk && (!user || guest) ? <TextField label="Your email" type="email" autoComplete="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} required /> : null}

      <Button type="submit" loading={busy} disabled={draft.message.trim() === ''}>
        Send feedback
      </Button>
    </form>
  );
}
