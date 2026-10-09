'use client';

import { useId, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SURVEY_QUESTIONS, type FeedbackHelped, type FeedbackKind } from '@chipperly/shared/schemas/feedback';
import { buildFeedbackBody, canSend, sendFeedback, type FeedbackDraft } from '@/lib/feedback/send';
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
  nps: 'What is the main reason?',
};

const EMPTY: FeedbackDraft = { kind: 'idea', message: '', rating: null, contactOk: false, contactEmail: '', problem: '', helped: '', easier: '', frustrated: '', liked: '', recommend: '', price: '' };

const HELPED: { value: FeedbackHelped; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'partly', label: 'Partly' },
  { value: 'no', label: 'No' },
];

const QUESTION = Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q.key, q.label])) as Record<(typeof SURVEY_QUESTIONS)[number]['key'], string>;

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <textarea id={id} className={styles.textarea} rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

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
        <textarea id={messageId} className={styles.textarea} rows={6} maxLength={4000} value={draft.message} onChange={(e) => set('message', e.target.value)} />
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
        <summary>Answer a few questions (optional)</summary>
        <div className={styles.fields}>
          <p className={styles.muted}>Short answers are fine. Skip any you like.</p>
          <Area label={QUESTION.q_problem} value={draft.problem} onChange={(v) => set('problem', v)} />
          <div className={styles.choice}>
            <span className={styles.choiceLabel} aria-hidden="true">{QUESTION.q_helped}</span>
            <Segmented label={QUESTION.q_helped} items={HELPED} value={draft.helped} onChange={(v) => set('helped', v as FeedbackHelped)} />
          </div>
          <Area label={QUESTION.q_easier} value={draft.easier} onChange={(v) => set('easier', v)} />
          <Area label={QUESTION.q_frustrated} value={draft.frustrated} onChange={(v) => set('frustrated', v)} />
          <Area label={QUESTION.q_liked} value={draft.liked} onChange={(v) => set('liked', v)} />
          <Area label={QUESTION.q_recommend} value={draft.recommend} onChange={(v) => set('recommend', v)} />
          <TextField label={QUESTION.q_price_monthly} hint="Whole dollars per month." inputMode="numeric" value={draft.price} onChange={(e) => set('price', e.target.value)} />
        </div>
      </details>

      <label className={styles.check}>
        <input type="checkbox" checked={draft.contactOk} onChange={(e) => set('contactOk', e.target.checked)} />
        <span>You may write back to me about this</span>
      </label>
      {draft.contactOk && (!user || guest) ? <TextField label="Your email" type="email" autoComplete="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} required /> : null}

      <Button type="submit" loading={busy} disabled={!canSend(draft)}>
        Send feedback
      </Button>
    </form>
  );
}
