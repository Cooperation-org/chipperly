'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackListSchema, type FeedbackItem, type FeedbackList } from '@chipperly/shared/schemas/feedback';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import { median } from '@/lib/feedback/median';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import styles from './FeedbackInbox.module.css';

const KIND_LABEL: Record<FeedbackItem['kind'], string> = { bug: 'Broken', idea: 'Idea', question: 'Question', love: 'Love it' };

const answers = (items: FeedbackItem[], key: 'price_bargain' | 'price_expensive' | 'price_too_expensive'): number[] =>
  items.map((i) => i[key]).filter((v): v is number => v !== null);

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

  const pricing = useMemo(() => {
    const all = items ?? [];
    return { bargain: answers(all, 'price_bargain'), expensive: answers(all, 'price_expensive'), tooExpensive: answers(all, 'price_too_expensive') };
  }, [items]);

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
        {pricing.bargain.length + pricing.expensive.length + pricing.tooExpensive.length === 0 ? (
          <p className={styles.muted}>Nobody has answered the pricing questions yet.</p>
        ) : (
          <ul className={styles.stats}>
            <li><strong>${median(pricing.bargain) ?? '-'}</strong> a bargain <span>({count(pricing.bargain.length)})</span></li>
            <li><strong>${median(pricing.expensive) ?? '-'}</strong> getting expensive <span>({count(pricing.expensive.length)})</span></li>
            <li><strong>${median(pricing.tooExpensive) ?? '-'}</strong> too expensive <span>({count(pricing.tooExpensive.length)})</span></li>
          </ul>
        )}
        <p className={styles.muted}>Middle value of the answers so far, in dollars per month. A handful of answers says little.</p>
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
            <span className={styles.muted}>{when(item.created_at)}</span>
          </header>
          <p className={styles.message}>{item.message}</p>
          <p className={styles.muted}>
            {item.signed_in ? `Signed in${item.account_kind ? `, ${item.account_kind} account` : ''}` : 'Guest'}
            {item.page ? `, on ${item.page}` : ''}
            {item.contact_email ? <>. Write back: <a href={`mailto:${item.contact_email}`}>{item.contact_email}</a></> : '. No way to write back.'}
          </p>
          {item.price_bargain !== null || item.price_expensive !== null || item.price_too_expensive !== null ? (
            <p className={styles.muted}>
              Price: bargain {item.price_bargain === null ? '-' : `$${item.price_bargain}`}, expensive {item.price_expensive === null ? '-' : `$${item.price_expensive}`}, too expensive {item.price_too_expensive === null ? '-' : `$${item.price_too_expensive}`}
            </p>
          ) : null}
          <Button variant="secondary" onClick={() => void mark(item, item.status === 'new' ? 'done' : 'new')}>
            {item.status === 'new' ? 'Mark done' : 'Reopen'}
          </Button>
        </article>
      ))}
    </div>
  );
}
