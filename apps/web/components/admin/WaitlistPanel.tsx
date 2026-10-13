'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminWaitlistEntry } from '@chipperly/shared/schemas/admin';
import { api, ApiError } from '@/lib/api/client';
import { canAct, useAdminRole } from '@/lib/admin/role';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { useSheet } from '@/components/ui/Sheet';
import { day, NOT_TEAM } from './format';
import styles from './AdminDashboard.module.css';
import own from './AdminExtras.module.css';

type Filter = 'waiting' | 'sent' | 'joined' | 'all';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'waiting', label: 'Waiting for a code' },
  { value: 'sent', label: 'Code sent' },
  { value: 'joined', label: 'Already signed up' },
  { value: 'all', label: 'All' },
];
const EMPTY: Record<Filter, string> = {
  waiting: 'Nobody is waiting for a code.',
  sent: 'No codes sent yet.',
  joined: 'Nobody from the waitlist has signed up yet.',
  all: 'Nobody has joined the waitlist yet.',
};
const ROLE_WORDS: Record<string, string> = {
  caregiver: 'Parent or caregiver',
  professional: 'Teacher or therapist',
  self: 'Neurodivergent adult',
  other: 'Other',
};

const stateOf = (e: AdminWaitlistEntry): Exclude<Filter, 'all'> => (e.has_account ? 'joined' : e.invited_at ? 'sent' : 'waiting');

function SendSheet({ emails, codeRequired, onDone }: { emails: string[]; codeRequired: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ sent: string[]; failed: string[] }>('/admin/waitlist/send-code', { emails });
      toast(`Sent to ${res.sent.length} ${res.sent.length === 1 ? 'person' : 'people'}`);
      if (res.failed.length) setFailed(res.failed);
      else onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <div className={styles.form}>
        <p className={styles.error} role="alert">
          These did not go out. The address may be wrong:
        </p>
        <ul className={own.list}>
          {failed.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={own.preview}>
        <p className={styles.name}>Your Chipperly beta invite</p>
        <p className={styles.muted}>
          A thank-you for joining the waitlist,{codeRequired ? ' the beta code,' : ''} and a button that opens sign-up with {codeRequired ? 'the code and ' : ''}their email
          already filled in.
        </p>
      </div>
      <p>
        It goes to {emails.length} {emails.length === 1 ? 'person' : 'people'}:
      </p>
      <ul className={own.list}>
        {emails.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button fullWidth loading={busy} onClick={() => void send()}>
        Send to {emails.length} {emails.length === 1 ? 'person' : 'people'}
      </Button>
    </div>
  );
}

/** The website's waitlist, with the beta code sent from here. Support sees it; only super admins send. */
export function WaitlistPanel() {
  const role = useAdminRole();
  const sheet = useSheet();
  const [entries, setEntries] = useState<AdminWaitlistEntry[] | null>(null);
  const [codeRequired, setCodeRequired] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    api.get<{ entries: AdminWaitlistEntry[]; code_required: boolean }>('/admin/waitlist').then(
      (r) => {
        setEntries(r.entries);
        setCodeRequired(r.code_required);
        setNotice(null);
        setPicked(new Set());
      },
      (err: unknown) => setNotice(err instanceof ApiError ? err.message : "Couldn't load the waitlist."),
    );
  }, []);

  useEffect(() => {
    if (role) load();
  }, [role, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) => (filter === 'all' || stateOf(e) === filter) && (!q || e.email.toLowerCase().includes(q) || (e.name ?? '').toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  if (!role) return <p className={styles.muted}>{NOT_TEAM}</p>;
  if (notice) return <p className={styles.muted}>{notice}</p>;
  if (!entries) return null;

  const canSend = canAct(role);
  const count = (f: Filter) => (f === 'all' ? entries.length : entries.filter((e) => stateOf(e) === f).length);
  const pickable = shown.filter((e) => !e.has_account);
  const allPicked = pickable.length > 0 && pickable.every((e) => picked.has(e.email));

  function toggle(email: string): void {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function openSend(emails: string[]): void {
    sheet.open(
      <SendSheet
        emails={emails}
        codeRequired={codeRequired}
        onDone={() => {
          sheet.close();
          load();
        }}
      />,
      { title: 'Send the beta code' },
    );
  }

  return (
    <div className={styles.page} data-wide>
      <div className={styles.stats}>
        {FILTERS.map((f) => (
          <div key={f.value} className={styles.stat}>
            <span className={styles.statValue}>{count(f.value)}</span>
            <span className={styles.statLabel}>{f.label}</span>
          </div>
        ))}
      </div>

      <section className={styles.card} aria-label="Waitlist">
        <div className={styles.headRow}>
          <Segmented label="Show" items={FILTERS.map((f) => ({ value: f.value, label: `${f.label} (${count(f.value)})` }))} value={filter} onChange={(v) => setFilter(v as Filter)} />
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        </div>
        <TextField label="Search email or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        {canSend && pickable.length > 0 ? (
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              className={own.check}
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((e) => e.email)))}
            />
            Select all shown ({pickable.length})
          </label>
        ) : null}

        {shown.length === 0 ? (
          <p className={styles.muted}>{query ? 'Nobody matches that search.' : EMPTY[filter]}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {canSend ? <th scope="col" aria-label="Select" /> : null}
                  <th scope="col">Person</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Status</th>
                  {canSend ? <th scope="col" aria-label="Actions" /> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const state = stateOf(e);
                  return (
                    <tr key={e.email}>
                      {canSend ? (
                        <td data-label="">
                          {e.has_account ? null : (
                            <input type="checkbox" className={own.check} aria-label={`Select ${e.email}`} checked={picked.has(e.email)} onChange={() => toggle(e.email)} />
                          )}
                        </td>
                      ) : null}
                      <td data-label="Person">
                        <div className={styles.cellStack}>
                          <span className={styles.name}>{e.email}</span>
                          {e.name ? <span>{e.name}</span> : null}
                          {e.role ? <span className={styles.muted}>{ROLE_WORDS[e.role] ?? e.role}</span> : null}
                        </div>
                      </td>
                      <td data-label="Joined" className={styles.nowrap}>
                        {day(e.created_at)}
                      </td>
                      <td data-label="Status">
                        <span className={`${own.chip} ${state === 'waiting' ? own.chipWaiting : ''}`}>
                          {state === 'joined' ? 'Signed up' : state === 'sent' ? `Code sent ${day(e.invited_at)}` : 'Waiting'}
                        </span>
                      </td>
                      {canSend ? (
                        <td data-label="">
                          {e.has_account ? null : (
                            <Button variant="secondary" onClick={() => openSend([e.email])}>
                              {e.invited_at ? 'Send again' : 'Send code'}
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canSend && picked.size > 0 ? (
        <div className={own.bar}>
          <span>
            {picked.size} {picked.size === 1 ? 'person' : 'people'} selected
          </span>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setPicked(new Set())}>
              Clear
            </Button>
            <Button onClick={() => openSend([...picked])}>
              Send beta code to {picked.size} {picked.size === 1 ? 'person' : 'people'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
