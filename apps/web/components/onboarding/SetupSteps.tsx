'use client';

import { useState } from 'react';
import type { Role } from '@chipperly/shared/schemas/account';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { newId } from '@/lib/ids';
import { addHelper, canAddRow, familyCounter, familyPeople, looksLikeEmail, tempPasswordError, type HelperInvite, type PersonDraft } from '@/lib/setupFlow';
import { PicturePicker } from '@/components/picture/PicturePicker';
import { ROLE_HINT, ROLE_ITEMS, ROLE_LABEL } from '@/components/careTeam/roles';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import styles from './SetupSteps.module.css';

export function blankPerson(name = ''): PersonDraft {
  return { id: newId(), name, emoji: null, photo_id: null };
}

interface BackProps {
  onBack?: () => void;
}
function BackButton({ onBack }: BackProps) {
  return onBack ? (
    <button type="button" className={styles.quiet} onClick={onBack}>
      Back
    </button>
  ) : null;
}

export interface FamilyStepProps extends BackProps {
  rows: PersonDraft[];
  onRows: (next: PersonDraft[]) => void;
  /** "I will use Chipperly too": the admin is one of the people, counted toward the 6. */
  meOn: boolean;
  onMeOn: (on: boolean) => void;
  me: PersonDraft;
  onMe: (next: PersonDraft) => void;
  onContinue: () => void;
}

/** Household step 1: up to 6 people on one screen, name and picture each. */
export function FamilyStep({ rows, onRows, meOn, onMeOn, me, onMe, onContinue, onBack }: FamilyStepProps) {
  const count = rows.length + (meOn ? 1 : 0);
  const update = (id: string, patch: Partial<PersonDraft>): void => onRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className={styles.step}>
      <h1 className={styles.title}>Who is in your family?</h1>
      <p className={styles.subtitle}>Add each person who will have a routine. You can add more later.</p>
      <p className={styles.counter} role="status" aria-label={`${familyCounter(count)} people`}>
        {familyCounter(count)}
      </p>
      {rows.map((row, i) => (
        <section key={row.id} className={styles.card} aria-label={`Person ${i + 1}`}>
          <TextField label={i === 0 ? 'Name' : `Name of person ${i + 1}`} autoComplete="off" maxLength={80} value={row.name} onChange={(e) => update(row.id, { name: e.target.value })} />
          <PicturePicker value={row} onChange={(v) => update(row.id, { emoji: v.emoji ?? null, photo_id: v.photo_id ?? null })} name={row.name} choices={AVATAR_EMOJI} />
          {rows.length > 1 ? (
            <Button variant="secondary" onClick={() => onRows(rows.filter((r) => r.id !== row.id))}>
              Remove {row.name.trim() || `person ${i + 1}`}
            </Button>
          ) : null}
        </section>
      ))}
      <Button variant="secondary" fullWidth disabled={!canAddRow(rows.length, meOn)} onClick={() => onRows([...rows, blankPerson()])}>
        + Add another person
      </Button>
      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span className={styles.switchLabel}>I will use Chipperly too</span>
          <Switch
            label="I will use Chipperly too"
            checked={meOn}
            onChange={(on) => {
              // The admin takes a place, so a full list drops its last blank row to make room.
              if (on && rows.length >= 6) onRows(rows.slice(0, 5));
              onMeOn(on);
            }}
          />
        </div>
        <p className={styles.hint}>You get your own routine and count as one of the 6.</p>
        {meOn ? (
          <>
            <TextField label="Your name" autoComplete="off" maxLength={80} value={me.name} onChange={(e) => onMe({ ...me, name: e.target.value })} />
            <PicturePicker value={me} onChange={(v) => onMe({ ...me, emoji: v.emoji ?? null, photo_id: v.photo_id ?? null })} name={me.name} choices={AVATAR_EMOJI} />
          </>
        ) : null}
      </div>
      <Button fullWidth disabled={familyPeople(rows, meOn ? me : null).length === 0} onClick={onContinue}>
        Continue
      </Button>
      <BackButton onBack={onBack} />
    </div>
  );
}

/** What is typed in an invite list's fields but not added yet. */
type Draft = { email: string; role: Role };

/** The list with a typed but not yet added address folded in, so Continue never drops it. */
function withDraft(list: HelperInvite[], draft: Draft): HelperInvite[] {
  return addHelper(list, draft.email, draft.role);
}

/** A small "email + role, Add" list used for support team and viewers. `roles` limits the choices. */
function InviteList({
  list,
  onList,
  roles,
  label,
  draft,
  onDraft,
}: {
  list: HelperInvite[];
  onList: (next: HelperInvite[]) => void;
  roles: readonly Role[];
  label: string;
  draft: Draft;
  onDraft: (next: Draft) => void;
}) {
  const { email, role } = draft;
  const [error, setError] = useState<string | undefined>();
  function add(): void {
    const next = addHelper(list, email, role);
    if (next.length === list.length) {
      setError(looksLikeEmail(email) ? 'That address is already on the list.' : 'That email does not look right.');
      return;
    }
    setError(undefined);
    onList(next);
    onDraft({ ...draft, email: '' });
  }
  return (
    <div className={styles.step}>
      <div className={styles.addRow}>
        <TextField
          label={label}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          error={error}
          onChange={(e) => onDraft({ ...draft, email: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" disabled={!email.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {roles.length > 1 ? (
        <div>
          <span className={styles.label}>Role</span>
          <Segmented label="Role" value={role} onChange={(v) => onDraft({ ...draft, role: v as Role })} items={ROLE_ITEMS.filter((i) => roles.includes(i.value))} />
          <p className={styles.hint}>{ROLE_HINT[role]}</p>
        </div>
      ) : null}
      {list.length > 0 ? (
        <ul className={styles.list}>
          {list.map((h) => (
            <li key={h.email} className={styles.listItem}>
              <span>
                {h.email} ({ROLE_LABEL[h.role]})
              </span>
              <button type="button" className={styles.quiet} aria-label={`Remove ${h.email}`} onClick={() => onList(list.filter((x) => x.email !== h.email))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export interface HelpersStepProps extends BackProps {
  name: string;
  helpers: HelperInvite[];
  onHelpers: (next: HelperInvite[]) => void;
  onContinue: (helpers: HelperInvite[]) => void;
}

/** Someone I support: "Who else helps {name}?" Invites go out once the person exists. */
export function HelpersStep({ name, helpers, onHelpers, onContinue, onBack }: HelpersStepProps) {
  const [draft, setDraft] = useState<Draft>({ email: '', role: 'member' });
  return (
    <div className={styles.step}>
      <h1 className={styles.title}>Who else helps {name}?</h1>
      <p className={styles.subtitle}>Invite family, friends or other professionals. Each one gets an email.</p>
      <InviteList list={helpers} onList={onHelpers} roles={['admin', 'member', 'viewer']} label="Email" draft={draft} onDraft={setDraft} />
      <Button
        fullWidth
        onClick={() => {
          const all = withDraft(helpers, draft);
          onHelpers(all);
          onContinue(all);
        }}
      >
        {helpers.length > 0 || draft.email.trim() ? 'Continue' : 'Skip'}
      </Button>
      <BackButton onBack={onBack} />
    </div>
  );
}

export interface OwnLogin {
  on: boolean;
  mode: 'invite' | 'password';
  email: string;
  password: string;
}
export const NO_LOGIN: OwnLogin = { on: false, mode: 'invite', email: '', password: '' };

/** The message that blocks Continue on the login step, or undefined. */
export function ownLoginError(login: OwnLogin): string | undefined {
  if (!login.on) return undefined;
  if (!looksLikeEmail(login.email)) return 'Enter their email address.';
  return login.mode === 'password' ? tempPasswordError(login.password) : undefined;
}

export interface LoginStepProps extends BackProps {
  name: string;
  login: OwnLogin;
  onLogin: (next: OwnLogin) => void;
  onContinue: () => void;
}

/** Someone I support: "{name} will have their own login", by invite email (default) or a temporary password. */
export function LoginStep({ name, login, onLogin, onContinue, onBack }: LoginStepProps) {
  const [showError, setShowError] = useState(false);
  const error = ownLoginError(login);
  return (
    <div className={styles.step}>
      <h1 className={styles.title}>Their own login</h1>
      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span className={styles.switchLabel}>{name} will have their own login</span>
          <Switch label={`${name} will have their own login`} checked={login.on} onChange={(on) => onLogin({ ...login, on })} />
        </div>
        <p className={styles.hint}>They sign in on their own phone or computer and see only their own routine.</p>
        {login.on ? (
          <>
            <fieldset className={styles.options}>
              <legend className={styles.label}>How do they get in?</legend>
              <label className={styles.option}>
                <input type="radio" name="own-login-mode" checked={login.mode === 'invite'} onChange={() => onLogin({ ...login, mode: 'invite' })} />
                Send an invite email
              </label>
              <label className={styles.option}>
                <input type="radio" name="own-login-mode" checked={login.mode === 'password'} onChange={() => onLogin({ ...login, mode: 'password' })} />
                Set a temporary password
              </label>
            </fieldset>
            <TextField label={`${name}'s email`} type="email" inputMode="email" autoComplete="off" value={login.email} onChange={(e) => onLogin({ ...login, email: e.target.value })} />
            {login.mode === 'password' ? (
              <TextField
                label="Temporary password"
                type="text"
                autoComplete="off"
                hint="They must choose their own password the first time they sign in."
                value={login.password}
                onChange={(e) => onLogin({ ...login, password: e.target.value })}
              />
            ) : (
              <p className={styles.hint}>They get an email with a link to create their own password.</p>
            )}
          </>
        ) : null}
      </div>
      {showError && error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button
        fullWidth
        onClick={() => {
          if (error) setShowError(true);
          else onContinue();
        }}
      >
        {login.on ? 'Continue' : 'Skip'}
      </Button>
      <BackButton onBack={onBack} />
    </div>
  );
}

export interface AdminsStepProps extends BackProps {
  admin: string;
  onAdmin: (v: string) => void;
  viewers: HelperInvite[];
  onViewers: (next: HelperInvite[]) => void;
  busy: boolean;
  onFinish: (viewers: HelperInvite[]) => void;
}

/** Household last step: one optional second admin, and Viewers (grandparents, a babysitter) who do not count as admins. */
export function AdminsStep({ admin, onAdmin, viewers, onViewers, busy, onFinish, onBack }: AdminsStepProps) {
  const [draft, setDraft] = useState<Draft>({ email: '', role: 'viewer' });
  const adminBad = admin.trim() !== '' && !looksLikeEmail(admin);
  const nothing = admin.trim() === '' && viewers.length === 0 && draft.email.trim() === '';
  return (
    <div className={styles.step}>
      <h1 className={styles.title}>Invite a second admin</h1>
      <p className={styles.subtitle}>Another parent or carer who can change everything. A family has up to 2 admins.</p>
      <TextField
        label="Second admin email (optional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        value={admin}
        error={adminBad ? 'That email does not look right.' : undefined}
        onChange={(e) => onAdmin(e.target.value)}
      />
      <h2 className={styles.cardTitle}>Viewers</h2>
      <p className={styles.hint}>Grandparents, a babysitter. They can look but not change anything, and they do not count as admins.</p>
      <InviteList list={viewers} onList={onViewers} roles={['viewer']} label="Viewer email" draft={draft} onDraft={setDraft} />
      <Button fullWidth loading={busy} disabled={adminBad} onClick={() => onFinish(withDraft(viewers, draft))}>
        {nothing ? 'Skip' : 'Finish'}
      </Button>
      <BackButton onBack={onBack} />
    </div>
  );
}
