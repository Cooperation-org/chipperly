'use client';

import { useState } from 'react';
import type { PromoCode, UpsertPromoCodeBody } from '@chipperly/shared/schemas/billing';
import { api, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import styles from './AdminDashboard.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd for a date input, in UTC (codes run whole UTC days). */
function toInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Creates or edits an early access offer. Dates are whole days, UTC: from the start of the first to the end of the last. */
export function PromoCodeSheet({ code, onSaved }: { code: PromoCode | null; onSaved: () => void }) {
  const [name, setName] = useState(code?.code ?? '');
  const [percent, setPercent] = useState(code?.percent_off ? String(code.percent_off) : '');
  const [appliesTo, setAppliesTo] = useState<'annual' | 'any'>(code?.applies_to ?? 'annual');
  const [from, setFrom] = useState(() => toInput(code?.valid_from ?? Date.now()));
  const [until, setUntil] = useState(() => toInput(code?.valid_until ?? Date.now() + 30 * DAY_MS));
  const [active, setActive] = useState(code?.active ?? true);
  const [autoIssue, setAutoIssue] = useState(code?.auto_issue ?? false);
  const [note, setNote] = useState(code?.note ?? '');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    const pct = percent.trim() ? Number(percent) : null;
    if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 100)) {
      setError('Discount is a whole number from 1 to 100, or empty for not decided yet.');
      return;
    }
    const body: UpsertPromoCodeBody = {
      code: name.trim().toUpperCase(),
      percent_off: pct,
      applies_to: appliesTo,
      valid_from: Date.parse(`${from}T00:00:00Z`),
      valid_until: Date.parse(`${until}T23:59:59Z`),
      active,
      auto_issue: autoIssue,
      note: note.trim() || null,
    };
    setSaving(true);
    setError(undefined);
    try {
      await api.put('/admin/promo-codes', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the code.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.form}>
      <TextField label="Offer name" value={name} disabled={Boolean(code)} onChange={(e) => setName(e.target.value)} autoCapitalize="characters" />
      <TextField label="Discount (%)" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} hint="Empty until decided." />
      <Segmented
        label="Applies to"
        items={[
          { value: 'annual', label: 'Annual plan' },
          { value: 'any', label: 'Any plan' },
        ]}
        value={appliesTo}
        onChange={(v) => setAppliesTo(v as 'annual' | 'any')}
      />
      <TextField label="First day" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <TextField label="Last day" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
      <div className={styles.toggleRow}>
        <span>Active</span>
        <Switch label="Active" checked={active} onChange={setActive} />
      </div>
      <div className={styles.toggleRow}>
        <span>Give everyone who signs up in these dates a code</span>
        <Switch label="Give a code at sign-up" checked={autoIssue} onChange={setAutoIssue} />
      </div>
      <TextField label="Note (just for the team)" value={note} onChange={(e) => setNote(e.target.value)} error={error} />
      <Button onClick={() => void save()} loading={saving} disabled={!name.trim()}>
        Save
      </Button>
    </div>
  );
}
