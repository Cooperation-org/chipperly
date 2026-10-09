'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackListSchema, SURVEY_QUESTIONS, type FeedbackItem, type FeedbackList } from '@chipperly/shared/schemas/feedback';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { median } from '@/lib/feedback/median';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import styles from './FeedbackInbox.module.css';

const KIND_LABEL: Record<FeedbackItem['kind'], string> = { bug: 'Broken', idea: 'Idea', question: 'Question', love: 'Love it', nps: 'Recommend?' };

const count = (n: number): string => `${n} ${n === 1 ? 'answer' : 'answers'}`;

function when(ms: number): string {
  return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Super admins only: what beta testers sent from Settings > Send feedback, plus what they said about price. */
export function FeedbackInbox() {
  const { user } = useSession();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [show, setShow] = useState<'new' | 'all'>('new');

  const load = useCallback(() => {
    void api
      .get<FeedbackList>('/admin/feedback', { schema: FeedbackListSchema })
      .then((r) => setItems(r.items))
      .catch(() => toast('Could not load feedback'));
  }, []);

  useEffect(() => {
    if (user?.is_super_admin) load();
  }, [user?.is_super_admin, load]);

  const prices = useMemo(() => (items ?? []).map((i) => i.q_price_monthly).filter((v): v is number => v !== null), [items]);

  if (!user?.is_super_admin) return <p>Only super admins can see this.</p>;
  if (!items) return null;

  const shown = show === 'new' ? items.filter((i) => i.status === 'new') : items;

  async function mark(item: FeedbackItem, status: FeedbackItem['status']): Promise<void> {
    try {
      await api.patch(`/admin/feedback/${item.id}`, { status });
      setItems((all) => (all ?? []).map((i) => (i.id === item.id ? { ...i, status } : i)));
    } catch {
      toast('Could not update that');
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="What they said about price">
        <h2 className={styles.title}>Price answers</h2>
        {prices.length === 0 ? (
          <p className={styles.muted}>Nobody has answered the pricing question yet.</p>
        ) : (
          <ul className={styles.stats}>
            <li><strong>${median(prices)}</strong> a month <span>({count(prices.length)})</span></li>
          </ul>
        )}
        <p className={styles.muted}>Middle value of what testers would pay, in dollars per month. A handful of answers says little.</p>
      </section>

      <Segmented
        label="Which feedback to show"
        items={[
          { value: 'new', label: `New (${items.filter((i) => i.status === 'new').length})` },
          { value: 'all', label: `All (${items.length})` },
        ]}
        value={show}
        onChange={(v) => setShow(v as 'new' | 'all')}
      />

      {shown.length === 0 ? <p className={styles.muted}>Nothing here.</p> : null}
      {shown.map((item) => (
        <article key={item.id} className={styles.card}>
          <header className={styles.head}>
            <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
            {item.rating ? <span>{item.rating} of 5</span> : null}
            {item.nps_score !== null ? <span>{item.nps_score} of 10</span> : null}
            <span className={styles.muted}>{when(item.created_at)}</span>
          </header>
          {item.message ? <p className={styles.message}>{item.message}</p> : null}
          <p className={styles.muted}>
            {item.signed_in ? `Signed in${item.account_kind ? `, ${item.account_kind} account` : ''}` : 'Guest'}
            {item.page ? `, on ${item.page}` : ''}
            {item.contact_email ? <>. Write back: <a href={`mailto:${item.contact_email}`}>{item.contact_email}</a></> : '. No way to write back.'}
          </p>
          {SURVEY_QUESTIONS.map(({ key, label }) =>
            item[key] === null ? null : (
              <p key={key} className={styles.message}>
                <strong>{label}</strong> {key === 'q_price_monthly' ? `$${item[key]} a month` : item[key]}
              </p>
            ),
          )}
          <Button variant="secondary" onClick={() => void mark(item, item.status === 'new' ? 'done' : 'new')}>
            {item.status === 'new' ? 'Mark done' : 'Reopen'}
          </Button>
        </article>
      ))}
    </div>
  );
}
