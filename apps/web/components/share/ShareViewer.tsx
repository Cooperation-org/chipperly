'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShareViewSchema, type ShareView, type ShareScheduleItem } from '@chipperly/shared/schemas/share';
import { apiBase, withBase } from '@/lib/api/base';
import { Picture } from '@/components/media/Picture';
import { ChipStrip } from '@/components/ui/ChipStrip';
import { CheckCircle } from '@/components/ui/CheckCircle';
import { Button } from '@/components/ui/Button';
import styles from './ShareViewer.module.css';

type Status = 'loading' | 'ready' | 'not_found' | 'error';

class ShareNotFoundError extends Error {}

interface ShareStepView {
  name: string;
  emoji: string | null;
  completed: boolean;
}

/** `steps` is landing on `ShareScheduleItem` in packages/shared separately; read it
 * defensively so this renders correctly before and after that schema change ships. */
function itemSteps(item: ShareScheduleItem): ShareStepView[] {
  const raw = (item as ShareScheduleItem & { steps?: unknown }).steps;
  return Array.isArray(raw) ? (raw as ShareStepView[]) : [];
}

/** Plain, unauthenticated `GET /share/:token` (technical-plan.md section 8). Throws
 * `ShareNotFoundError` for a 404 so callers can tell "gone" from "network trouble". */
async function fetchShareView(token: string): Promise<ShareView> {
  const res = await fetch(`${apiBase}/share/${encodeURIComponent(token)}`);
  if (res.status === 404) throw new ShareNotFoundError();
  if (!res.ok) throw new Error(`share fetch failed: ${res.status}`);
  const json: unknown = await res.json();
  return ShareViewSchema.parse(json);
}

/** "Updated N minutes ago" (S34). A top-level helper, not an inline `Date.now()` in the
 * component body, so the value is only ever read where a render actually needs it. */
function formatUpdatedAgo(updatedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
  if (minutes === 0) return 'Updated just now';
  return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
}

/**
 * S34: the public read-only share page. Nothing on the page is tappable but
 * Refresh.
 */
export function ShareViewer() {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<Status>(() => (token ? 'loading' : 'not_found'));
  const [view, setView] = useState<ShareView | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchShareView(token)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof ShareNotFoundError ? 'not_found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function refresh(): void {
    if (!token) return;
    setStatus('loading');
    fetchShareView(token)
      .then((next) => {
        setView(next);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        setStatus(err instanceof ShareNotFoundError ? 'not_found' : 'error');
      });
  }

  if (status === 'not_found') {
    return (
      <div className={styles.screen}>
        <p className={styles.message}>This link isn&rsquo;t active.</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className={styles.screen}>
        {status === 'error' ? (
          <>
            <p className={styles.message}>Couldn&rsquo;t load this link. Try again.</p>
            <Button onClick={refresh}>Retry</Button>
          </>
        ) : null}
      </div>
    );
  }

  const total = view.working_for_reward?.chip_cost ?? Math.max(view.chip_balance, 0);
  const filled = Math.min(Math.max(view.chip_balance, 0), total);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Picture emoji={view.profile_emoji} name={view.profile_name} size="child" />
        <h1 className={styles.name}>{view.profile_name}</h1>
      </header>

      <ChipStrip
        filled={filled}
        total={total}
        reward={
          view.working_for_reward
            ? { emoji: view.working_for_reward.emoji ?? undefined, name: view.working_for_reward.name }
            : undefined
        }
      />

      <ul className={styles.list}>
        {view.items.map((item) => {
          const steps = itemSteps(item);
          return (
            <li key={item.id} className={styles.itemWrap}>
              <div className={[styles.row, item.completed_at !== null ? styles.dimmed : ''].filter(Boolean).join(' ')}>
                <Picture emoji={item.activity_emoji} name={item.activity_name} size="list" />
                <span className={styles.rowName}>{item.activity_name}</span>
                <CheckCircle checked={item.completed_at !== null} name={item.activity_name} disabled />
              </div>
              {steps.length > 0 ? (
                <ul className={styles.steps}>
                  {steps.map((step, i) => (
                    <li key={i} className={[styles.stepRow, step.completed ? styles.dimmed : ''].filter(Boolean).join(' ')}>
                      <Picture emoji={step.emoji} name={step.name} size="list" />
                      <span className={styles.rowName}>{step.name}</span>
                      <CheckCircle checked={step.completed} name={step.name} disabled />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className={styles.footerRow}>
        <span className={styles.updated}>{formatUpdatedAgo(view.updated_at)}</span>
        <Button variant="secondary" icon="sync" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <p className={styles.footer}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API */}
        <img src={withBase('/brand/mark.svg')} alt="" width={16} height={16} className={styles.footerMark} />
        Shared from Chipperly
      </p>
    </div>
  );
}
