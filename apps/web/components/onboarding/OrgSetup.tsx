'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@chipperly/shared/schemas/account';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { parsePeopleList } from '@chipperly/shared/helpers/parsePeopleList';
import type { BulkPerson } from '@chipperly/shared/schemas/org';
import { api, ApiError } from '@/lib/api/client';
import { useKv } from '@/lib/db/kv';
import { refreshMe } from '@/lib/auth/session';
import {
  CSV_TEMPLATE,
  ORG_STEP_COUNT,
  ORG_TYPES,
  canContinueAbout,
  peopleInGroups,
  splitEmails,
  stepFromState,
  suggestedPlanLine,
  type OrgType,
} from '@/lib/orgSetup';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { missingPersonError, ROLE_HINT, ROLE_ITEMS } from '@/components/careTeam/roles';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import styles from './OrgSetup.module.css';

const ACTIVE_ACCOUNT_KEY = 'active_account_id';
const DEFAULT_GROUP = 'Everyone';
const MAX_GROUPS = 50;

type Row = BulkPerson;
interface RosterPerson {
  profile_id: string;
  name: string;
  cluster_id: string | null;
}
interface ClusterRow {
  id: string;
  name: string;
  archived_at: number | null;
}
interface BulkResult {
  created: { profile_id: string; name: string }[];
  invites_sent: number;
  errors: { row: number; message: string }[];
}

type Tab = 'one' | 'paste' | 'csv';
const TABS: { value: Tab; label: string }[] = [
  { value: 'one', label: 'One at a time' },
  { value: 'paste', label: 'Paste a list' },
  { value: 'csv', label: 'Upload a CSV' },
];

const GENERIC_ERROR = "Couldn't save that. Try again.";

/** Organization setup: six one-screen steps after "My organization" is picked. */
export function OrgSetup() {
  const router = useRouter();
  const accountId = useKv<string | null>(ACTIVE_ACCOUNT_KEY, null);
  const [step, setStep] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [size, setSize] = useState('');
  // 3
  const [groups, setGroups] = useState<string[]>([]);
  const [groupInput, setGroupInput] = useState('');
  // 4
  const [tab, setTab] = useState<Tab>('one');
  const [rows, setRows] = useState<Row[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [oneName, setOneName] = useState('');
  const [oneGroup, setOneGroup] = useState('');
  const [oneEmail, setOneEmail] = useState('');
  const [onePicture, setOnePicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  const [saved, setSaved] = useState<BulkResult | null>(null);
  // 5
  const [roster, setRoster] = useState<RosterPerson[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [everyone, setEveryone] = useState(false);
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [personIds, setPersonIds] = useState<Set<string>>(new Set());
  const [staffSent, setStaffSent] = useState<number | null>(null);

  // Each forward move is a history entry, so the browser Back button (and Back below) goes one step back.
  function go(next: number): void {
    setError(null);
    setStep(next);
    window.history.pushState({ orgStep: next }, '');
  }
  useEffect(() => {
    // A reload keeps the entry's old step but not the answers: start over from the first screen.
    if (stepFromState(window.history.state) !== 0) window.history.replaceState({ ...window.history.state, orgStep: 0 }, '');
    function onPop(): void {
      setError(null);
      setStep(stepFromState(window.history.state));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The button that changed the step is gone: move focus to the new heading so it is read out.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) firstStep.current = false;
    else wrapRef.current?.querySelector('h1')?.focus();
  }, [step]);

  // Staff step needs the real ids of the people and groups just saved.
  useEffect(() => {
    if (step !== 4 || !accountId) return;
    let alive = true;
    void (async () => {
      try {
        const [r, c] = await Promise.all([
          api.get<{ people: RosterPerson[] }>(`/accounts/${accountId}/roster?status=active`),
          api.get<{ clusters: ClusterRow[] }>(`/accounts/${accountId}/clusters`),
        ]);
        if (!alive) return;
        setRoster(r.people);
        setClusters(c.clusters.filter((x) => !x.archived_at));
      } catch {
        /* the form still works for Admin invites */
      }
    })();
    return () => {
      alive = false;
    };
  }, [step, accountId]);

  const sizeNumber = parseInt(size, 10);

  async function saveAbout(): Promise<void> {
    if (!accountId) return setError('Something went wrong. Start over.');
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/accounts/${accountId}/org`, {
        name: orgName.trim(),
        org_type: orgType,
        ...(sizeNumber >= 1 ? { org_size_estimate: sizeNumber } : {}),
      });
      go(1);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function addGroup(): void {
    const g = groupInput.trim();
    setGroupInput('');
    if (g && groups.length < MAX_GROUPS && !groups.some((x) => x.toLowerCase() === g.toLowerCase())) setGroups([...groups, g]);
  }

  async function saveGroups(): Promise<void> {
    if (!accountId) return setError('Something went wrong. Start over.');
    // Skipping, or typing a name and not pressing Add, both still do the right thing.
    const typed = groupInput.trim();
    const names = groups.length > 0 || typed ? [...groups, ...(typed && !groups.some((g) => g.toLowerCase() === typed.toLowerCase()) ? [typed] : [])] : [DEFAULT_GROUP];
    setBusy(true);
    setError(null);
    try {
      const existing = await api.get<{ clusters: ClusterRow[] }>(`/accounts/${accountId}/clusters`);
      const have = new Set(existing.clusters.filter((c) => !c.archived_at).map((c) => c.name.toLowerCase()));
      for (const name of names) {
        if (!have.has(name.toLowerCase())) await api.post(`/accounts/${accountId}/clusters`, { name });
      }
      setGroups(names);
      setGroupInput('');
      go(3);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function addOne(): void {
    const name = oneName.trim();
    if (!name) return;
    const email = oneEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('That parent email does not look right.');
    setError(null);
    setRows([
      ...rows,
      { name, ...(oneGroup ? { cluster_name: oneGroup } : {}), ...(email ? { parent_email: email } : {}), ...(onePicture.emoji ? { emoji: onePicture.emoji } : {}), ...(onePicture.photo_id ? { photo_id: onePicture.photo_id } : {}) },
    ]);
    setOneName('');
    setOneEmail('');
    setOnePicture({ emoji: null, photo_id: null });
  }

  function addParsed(text: string): void {
    const { people, errors } = parsePeopleList(text);
    setRows([...rows, ...people]);
    setParseErrors(errors);
    setPasteText('');
  }

  async function onCsvFile(file: File | undefined): Promise<void> {
    if (file) addParsed(await file.text());
  }

  function downloadTemplate(): void {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chipperly-people.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function savePeople(): Promise<void> {
    if (!accountId || rows.length === 0) return;
    setBusy(true);
    setError(null);
    // One group means everyone goes in it, unless the row names another.
    const fallback = groups.length === 1 ? groups[0] : undefined;
    try {
      const result = await api.post<BulkResult>(`/accounts/${accountId}/profiles/bulk`, {
        people: rows.map((r) => ({ ...r, ...(r.cluster_name || !fallback ? {} : { cluster_name: fallback }) })),
      });
      setSaved(result);
      setRows([]);
      await refreshMe();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? 'Only an admin can add people.' : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function toggle(set: Set<string>, id: string, put: (s: Set<string>) => void): void {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    put(next);
  }

  async function sendStaff(): Promise<void> {
    if (!accountId) return;
    const list = splitEmails(emails);
    if (list.length === 0) return setError('Enter at least one email address.');
    const ids = role === 'admin' ? roster.map((p) => p.profile_id) : Array.from(new Set([...peopleInGroups(roster, groupIds, everyone), ...personIds]));
    const missing = missingPersonError(role, new Set(ids));
    if (missing) return setError(missing);
    setBusy(true);
    setError(null);
    let sent = 0;
    const failed: string[] = [];
    for (const email of list) {
      try {
        await api.post(`/accounts/${accountId}/invites`, { email, role, profile_ids: ids, relationship_label: null });
        sent++;
      } catch {
        failed.push(email);
      }
    }
    setBusy(false);
    if (failed.length > 0) {
      setEmails(failed.join('\n'));
      setError(`Couldn't invite ${failed.join(', ')}. Check the address and try again.`);
      setStaffSent((staffSent ?? 0) + sent);
      return;
    }
    go(5);
  }

  const labelStep = `Step ${step + 1} of ${ORG_STEP_COUNT}`;
  const dots = (
    <div className={styles.dots} role="img" aria-label={labelStep}>
      {Array.from({ length: ORG_STEP_COUNT }, (_, i) => (
        <span key={i} className={i === step ? styles.dotOn : styles.dot} />
      ))}
    </div>
  );
  const back =
    step > 0 ? (
      <button type="button" className={styles.quiet} onClick={() => window.history.back()}>
        Back
      </button>
    ) : null;
  const errorLine = error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {dots}

      {step === 0 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>About your organization</h1>
          <TextField label="Organization name" value={orgName} maxLength={80} onChange={(e) => setOrgName(e.target.value)} autoComplete="organization" />
          <div>
            <span className={styles.label}>Type</span>
            <Segmented label="Type" value={orgType ?? ''} onChange={(v) => setOrgType(v as OrgType)} items={ORG_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </div>
          <TextField label="About how many people do you support?" type="number" inputMode="numeric" min={1} value={size} onChange={(e) => setSize(e.target.value)} />
          {suggestedPlanLine(sizeNumber) ? <p className={styles.plan}>{suggestedPlanLine(sizeNumber)}</p> : null}
          {errorLine}
          <Button fullWidth loading={busy} disabled={!canContinueAbout(orgName, orgType)} onClick={() => void saveAbout()}>
            Continue
          </Button>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>Your role</h1>
          <p className={styles.lead}>You are the owner of {orgName.trim()}. You can add staff next.</p>
          <Button fullWidth onClick={() => go(2)}>
            Continue
          </Button>
          {back}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>Groups</h1>
          <p className={styles.lead}>Do you group people by site, team or caseload?</p>
          <div className={styles.addRow}>
            <TextField
              label="Group name"
              value={groupInput}
              maxLength={60}
              onChange={(e) => setGroupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGroup();
                }
              }}
            />
            <Button variant="secondary" onClick={addGroup} disabled={!groupInput.trim()}>
              Add
            </Button>
          </div>
          {groups.length > 0 ? (
            <ul className={styles.chips}>
              {groups.map((g) => (
                <li key={g} className={styles.chip}>
                  {g}
                  <button type="button" className={styles.chipX} aria-label={`Remove ${g}`} onClick={() => setGroups(groups.filter((x) => x !== g))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {errorLine}
          <Button fullWidth loading={busy} onClick={() => void saveGroups()}>
            {groups.length > 0 || groupInput.trim() ? 'Continue' : 'Skip'}
          </Button>
          {back}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>Add people</h1>
          {saved ? (
            <>
              <p className={styles.lead}>
                Added {saved.created.length} {saved.created.length === 1 ? 'person' : 'people'}.
              </p>
              {saved.errors.length > 0 ? (
                <ul className={styles.errorList}>
                  {saved.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button fullWidth onClick={() => go(4)}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <div className={styles.tabs} role="group" aria-label="How to add people">
                {TABS.map((t) => (
                  <button key={t.value} type="button" className={styles.tab} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'one' ? (
                <div className={styles.form}>
                  <TextField label="Name" value={oneName} maxLength={80} onChange={(e) => setOneName(e.target.value)} />
                  <PicturePicker value={onePicture} onChange={setOnePicture} name={oneName} choices={AVATAR_EMOJI} />
                  {groups.length > 0 ? (
                    <label className={styles.select}>
                      <span className={styles.label}>Group</span>
                      <select value={oneGroup} onChange={(e) => setOneGroup(e.target.value)}>
                        <option value="">{groups.length === 1 ? groups[0] : 'No group'}</option>
                        {groups.length > 1 ? groups.map((g) => <option key={g}>{g}</option>) : null}
                      </select>
                    </label>
                  ) : null}
                  <TextField label="Parent email (optional)" type="email" inputMode="email" value={oneEmail} onChange={(e) => setOneEmail(e.target.value)} />
                  <Button variant="secondary" fullWidth disabled={!oneName.trim()} onClick={addOne}>
                    Add to list
                  </Button>
                </div>
              ) : null}

              {tab === 'paste' ? (
                <div className={styles.form}>
                  <label className={styles.select}>
                    <span className={styles.label}>One name per line, or start with a header row: name, group, parent email</span>
                    <textarea className={styles.textarea} rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                  </label>
                  <Button variant="secondary" fullWidth disabled={!pasteText.trim()} onClick={() => addParsed(pasteText)}>
                    Add to list
                  </Button>
                </div>
              ) : null}

              {tab === 'csv' ? (
                <div className={styles.form}>
                  <label className={styles.select}>
                    <span className={styles.label}>CSV file</span>
                    <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void onCsvFile(e.target.files?.[0])} />
                  </label>
                  <button type="button" className={styles.link} onClick={downloadTemplate}>
                    Download the template
                  </button>
                </div>
              ) : null}

              {parseErrors.length > 0 ? (
                <ul className={styles.errorList} role="alert">
                  {parseErrors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {rows.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Group</th>
                        <th>Parent email</th>
                        <th>
                          <VisuallyHidden>Remove</VisuallyHidden>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td>
                            {r.photo_id ? '(photo) ' : r.emoji ? `${r.emoji} ` : ''}
                            {r.name}
                          </td>
                          <td>{r.cluster_name ?? (groups.length === 1 ? groups[0] : '')}</td>
                          <td>{r.parent_email ?? ''}</td>
                          <td>
                            <button type="button" className={styles.chipX} aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {errorLine}
              <Button fullWidth loading={busy} disabled={rows.length === 0} onClick={() => void savePeople()}>
                {rows.length > 0 ? `Add ${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : 'Add people'}
              </Button>
              <button type="button" className={styles.quiet} onClick={() => go(4)}>
                Skip
              </button>
            </>
          )}
          {back}
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>Invite staff</h1>
          <label className={styles.select}>
            <span className={styles.label}>Emails, one per line</span>
            <textarea className={styles.textarea} rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
          </label>
          <div>
            <span className={styles.label}>Role</span>
            <Segmented label="Role" value={role} onChange={(v) => setRole(v as Role)} items={ROLE_ITEMS} />
            <p className={styles.hint}>{ROLE_HINT[role]}</p>
          </div>
          {role !== 'admin' ? (
            <fieldset className={styles.checks}>
              <legend className={styles.label}>Who they see</legend>
              <label className={styles.check}>
                <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
                Everyone
              </label>
              {clusters.map((c) => (
                <label key={c.id} className={styles.check}>
                  <input type="checkbox" checked={groupIds.has(c.id)} onChange={() => toggle(groupIds, c.id, setGroupIds)} />
                  {c.name}
                </label>
              ))}
              {roster.length > 0 && roster.length <= 30
                ? roster.map((p) => (
                    <label key={p.profile_id} className={styles.check}>
                      <input type="checkbox" checked={personIds.has(p.profile_id)} onChange={() => toggle(personIds, p.profile_id, setPersonIds)} />
                      {p.name}
                    </label>
                  ))
                : null}
            </fieldset>
          ) : null}
          {errorLine}
          <Button fullWidth loading={busy} disabled={!emails.trim()} onClick={() => void sendStaff()}>
            Send invites
          </Button>
          <button type="button" className={styles.quiet} onClick={() => go(5)}>
            Skip
          </button>
          {back}
        </>
      ) : null}

      {step === 5 ? (
        <>
          <h1 className={styles.title} tabIndex={-1}>Families</h1>
          {(saved?.invites_sent ?? 0) > 0 ? (
            <p className={styles.lead}>
              We sent {saved?.invites_sent} family {saved?.invites_sent === 1 ? 'invite' : 'invites'}. Families see their child&apos;s schedule, notes and reports. They are free.
            </p>
          ) : (
            <p className={styles.lead}>No family emails yet. You can invite families any time. They are free.</p>
          )}
          <Button fullWidth onClick={() => router.push('/org/')}>
            Done
          </Button>
          {back}
        </>
      ) : null}
    </div>
  );
}
