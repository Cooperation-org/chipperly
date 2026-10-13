'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';
import { refreshMe } from '@/lib/auth/session';
import { parsePeopleList } from '@chipperly/shared/helpers/parsePeopleList';
import { orgErrorMessage, type Cluster } from '@/lib/org/roster';
import styles from './Org.module.css';

interface BulkResponse {
  created: { profile_id: string; name: string }[];
  invites_sent: number;
  errors: { row: number; message: string }[];
  seats?: { used: number; limit: number | null; over?: boolean };
}

/**
 * Add one person or many: one per line as "name, group, parent email", or pick a CSV file.
 * Shared by the Org home and the org setup flow. Posts to /accounts/:id/profiles/bulk.
 */
export function AddPeople({
  accountId,
  clusters,
  onDone,
}: {
  accountId: string;
  clusters: Cluster[];
  onDone: (result: BulkResponse) => void;
}) {
  const [text, setText] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const parsed = parsePeopleList(text);

  async function readFile(file: File | undefined): Promise<void> {
    if (file) setText(await file.text());
  }

  async function submit(): Promise<void> {
    if (parsed.people.length === 0) {
      setError('Add at least one name.');
      return;
    }
    if (parsed.errors.length > 0) {
      setError('Fix the lines marked below first.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const res = await api.post<BulkResponse>(`/accounts/${accountId}/profiles/bulk`, {
        people: parsed.people.map((r) => (clusterId && !r.cluster_name ? { ...r, cluster_id: clusterId } : r)),
      });
      await refreshMe().catch(() => undefined);
      onDone(res);
    } catch (e) {
      setError(e instanceof ApiError ? orgErrorMessage(e.code) : 'Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.addForm}>
      <label className={styles.fieldLabel} htmlFor="org-add-people">
        Names, one per line
      </label>
      <textarea
        id="org-add-people"
        className={styles.textarea}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Ava\nBen, North clinic\nCy, North clinic, cy.parent@example.com'}
      />
      <p className={styles.hint}>Optional after the name: a group, then a parent email. We send the parent a link to view.</p>
      <label className={styles.fieldLabel}>
        Or choose a CSV file
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
      </label>
      {clusters.length > 0 ? (
        <label className={styles.fieldLabel}>
          Group for lines without one
          <select className={styles.select} value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
            <option value="">No group</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {parsed.errors.length > 0 ? (
        <ul className={styles.problems}>
          {parsed.errors.map((p) => (
            <li key={`${p.row}-${p.message}`}>{`Line ${p.row}: ` : ''}{p.message}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <Button fullWidth size="lg" loading={saving} onClick={() => void submit()}>
        {parsed.people.length > 1 ? `Add ${parsed.people.length} people` : 'Add person'}
      </Button>
    </div>
  );
}
