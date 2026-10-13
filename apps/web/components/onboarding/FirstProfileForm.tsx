'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Role } from '@chipperly/shared/schemas/account';
import type { Profile, SetupAnswers } from '@chipperly/shared/schemas/profile';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { api, ApiError, TimeoutError, TIMEOUT_MESSAGE } from '@/lib/api/client';
import { setKv, useKv } from '@/lib/db/kv';
import { refreshMe, useSession } from '@/lib/auth/session';
import { useActiveProfile } from '@/lib/profile/active';
import { saveGuidedSetup, type GuidedPicks } from '@/lib/profile/guidedSetup';
import { familyPeople, prefillName, type HelperInvite, type PersonDraft } from '@/lib/setupFlow';
import { toast } from '@/lib/toast';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { UsesAppSwitch } from '@/components/settings/UsesAppSwitch';
import { SetupQuestions } from './SetupQuestions';
import { AdminsStep, blankPerson, FamilyStep, HelpersStep, LoginStep, NO_LOGIN, type OwnLogin } from './SetupSteps';
import styles from './FirstProfileForm.module.css';

/** kv key documented in CONTRACTS.md's lib/db/db.ts; set by S3 (KindPicker) via useActiveAccount().setActiveAccountId. */
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

/** kv key: the setup interview's answers (or null for skipped), read once by S5 (Ready) for its summary. */
export const SETUP_ANSWERS_KEY = 'onboarding_setup';

type Stage = 'who' | 'helpers' | 'login' | 'setup' | 'admins';
interface Result {
  answers: SetupAnswers | null;
  picks?: GuidedPicks;
}
interface HistoryEntry {
  stage?: Stage;
  person?: number;
}

const SAVE_ERROR = "Couldn't save that. Try again.";

/**
 * S4: who is this for, then the setup interview (S4b, SetupQuestions). What comes before the
 * interview depends on the plan type: "Myself" asks what to call you; "Someone I support" asks
 * for their name and picture, who else helps and whether they get their own login; "My family"
 * lists up to 6 people on one screen and runs the interview once per person. Every step is one
 * history entry, so the browser Back button goes one step back.
 */
export function FirstProfileForm() {
  const router = useRouter();
  const accountId = useKv<string | null>(ACTIVE_ACCOUNT_KEY, null);
  const { status, user, accounts, profiles: sessionProfiles } = useSession();
  const { setActiveProfileId } = useActiveProfile();
  const account = accounts.find((a) => a.account.id === accountId)?.account;
  const kind = account?.kind;
  const selfMode = kind === 'individual';
  const familyMode = kind === 'household';

  const [stage, setStage] = useState<Stage>('who');
  const [person, setPerson] = useState(0);
  // Myself and Someone I support.
  // Typed text wins; until then Myself shows the sign-up name (never an email, see prefillName).
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? (selfMode ? prefillName(user?.display_name) : '');
  const [picture, setPicture] = useState<PicturePickerValue>({ emoji: null, photo_id: null });
  const [usesApp, setUsesApp] = useState(true);
  const [helpers, setHelpers] = useState<HelperInvite[]>([]);
  const [login, setLogin] = useState<OwnLogin>(NO_LOGIN);
  // My family.
  const [rows, setRows] = useState<PersonDraft[]>(() => [blankPerson()]);
  const [meOn, setMeOn] = useState(false);
  const [meBase] = useState<PersonDraft>(() => blankPerson());
  const [meEdited, setMe] = useState<PersonDraft | null>(null);
  const me: PersonDraft = meEdited ?? { ...meBase, name: prefillName(user?.display_name) };
  const [secondAdmin, setSecondAdmin] = useState('');
  const [results, setResults] = useState<Result[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  /** Profiles already made by an earlier try of "create", so a retry never adds a second one. */
  const made = useRef<Profile[]>([]);

  // The profile already exists (Back from the ready screen, or a reload after finishing): creating another is refused, so go on to ready.
  const hasProfile = Boolean(accountId) && sessionProfiles.some((p) => p.account_id === accountId);
  useEffect(() => {
    if (status === 'signed_in' && hasProfile && !submitted.current) router.replace('/onboarding/ready/');
  }, [status, hasProfile, router]);

  useEffect(() => {
    // A reload keeps the entry's old step but not the answers: start over from the first screen.
    const at = window.history.state as HistoryEntry | null;
    if (at?.stage && at.stage !== 'who') window.history.replaceState({ ...window.history.state, stage: 'who', person: 0, setupStep: undefined }, '');
    function onPop(): void {
      const now = window.history.state as HistoryEntry | null;
      setError(null);
      setStage(now?.stage ?? 'who');
      setPerson(now?.person ?? 0);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(next: Stage, who = 0): void {
    setError(null);
    setStage(next);
    setPerson(who);
    window.history.pushState({ stage: next, person: who }, '');
  }
  const back = (): void => window.history.back();

  /** The people to create, in order. One for Myself and Someone I support. */
  function peopleToMake(): PersonDraft[] {
    if (familyMode) return familyPeople(rows, meOn ? me : null);
    return [{ id: 'one', name: name.trim(), emoji: selfMode ? '🙂' : (picture.emoji ?? null), photo_id: selfMode ? null : (picture.photo_id ?? null) }];
  }

  /** Invites and the own-login choice, after the people exist. A failure is said once and never blocks the way on. */
  async function sendExtras(accId: string, made_: Profile[], viewers: HelperInvite[]): Promise<void> {
    const failed: string[] = [];
    const invite = async (email: string, role: Role, ids: string[]): Promise<void> => {
      try {
        await api.post(`/accounts/${accId}/invites`, { email, role, profile_ids: ids, relationship_label: null });
      } catch {
        failed.push(email);
      }
    };
    const first = made_[0];
    if (kind === 'supported' && first) {
      for (const h of helpers) await invite(h.email, h.role, [first.id]);
      if (login.on) {
        try {
          await api.post(`/accounts/${accId}/profiles/${first.id}/login`, {
            mode: login.mode,
            email: login.email.trim(),
            ...(login.mode === 'password' ? { password: login.password } : {}),
          });
        } catch (err) {
          toast(
            err instanceof ApiError && err.code === 'email_taken'
              ? `${login.email.trim()} already has a Chipperly login. Invite them from the Team screen.`
              : `Couldn't set up ${first.name}'s login. Try again from the Team screen.`,
            { carry: true },
          );
        }
      }
    }
    if (familyMode) {
      const ids = made_.map((p) => p.id);
      if (secondAdmin.trim()) await invite(secondAdmin.trim(), 'admin', ids);
      for (const v of viewers) await invite(v.email, 'viewer', ids);
    }
    if (failed.length > 0) toast(`Couldn't invite ${failed.join(', ')}. Add them from the Team screen.`, { carry: true });
  }

  async function create(all: Result[], viewers: HelperInvite[] = []): Promise<void> {
    if (!accountId) {
      setError('Something went wrong. Start over.');
      return;
    }
    submitted.current = true;
    setLoading(true);
    setError(null);
    try {
      const people = peopleToMake();
      // Myself: the name typed here is also what the account calls them.
      if (selfMode && user && people[0] && people[0].name !== user.display_name) {
        await api.patch('/me/name', { display_name: people[0].name }).catch(() => toast("Couldn't save your name. Change it in Settings.", { carry: true }));
      }
      for (let i = made.current.length; i < people.length; i++) {
        const p = people[i]!;
        const setup = all[i]?.answers ?? null;
        const profile = await api.post<Profile>(`/accounts/${accountId}/profiles`, {
          name: p.name,
          emoji: p.emoji,
          photo_id: p.photo_id,
          child_uses_app: selfMode || familyMode ? true : usesApp,
          ...(setup ? { setup } : {}),
        });
        made.current.push(profile);
        // The server made no locations or rewards for guided answers; they are created here, with their photos.
        const picks = all[i]?.picks;
        if (picks) await saveGuidedSetup(profile.id, picks).catch(() => toast(`Couldn't save the places and rewards for ${p.name}. Add them in settings.`, { carry: true }));
      }
      await setKv(SETUP_ANSWERS_KEY, all[0]?.answers ?? null);
      // The profiles exist server-side now; a slow refresh must not fail the step (and a retry would add duplicates).
      await refreshMe().catch(() => undefined);
      setActiveProfileId(made.current[0]!.id);
      await sendExtras(accountId, made.current, viewers);
      router.push('/onboarding/ready/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'profile_limit') {
        // An earlier attempt got through (a slow reply, then a retry): the profile is there, so carry on.
        await refreshMe().catch(() => undefined);
        router.replace('/onboarding/ready/');
        return;
      }
      setError(err instanceof TimeoutError ? TIMEOUT_MESSAGE : SAVE_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function onSetupDone(answers: SetupAnswers | null, picks?: GuidedPicks): void {
    const all = [...results];
    all[person] = { answers, picks };
    setResults(all);
    if (familyMode) {
      const total = familyPeople(rows, meOn ? me : null).length;
      if (person + 1 < total) go('setup', person + 1);
      else go('admins');
    } else void create(all);
  }

  function submitWho(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    go(kind === 'supported' ? 'helpers' : 'setup');
  }

  const errorLine = error ? (
    <p className={styles.error} role="alert">
      {error}
      {!accountId ? (
        <>
          {' '}
          <Link href="/onboarding/kind/" className={styles.link}>
            Go back
          </Link>
        </>
      ) : null}
    </p>
  ) : null;

  // The account row hasn't loaded yet; rendering the wrong branch for a
  // moment would flash the wrong form at the person.
  if (accountId && !account) return null;

  const people = familyMode ? familyPeople(rows, meOn ? me : null) : [];
  const shownName = name.trim() || (selfMode ? 'you' : 'them');

  if (stage === 'setup') {
    const first = results[0] && people[0] ? { name: people[0].name, answers: results[0].answers, picks: results[0].picks } : null;
    const forPerson = familyMode ? (people[person]?.name ?? '') : shownName;
    return (
      <div className={styles.form}>
        <SetupQuestions
          key={person}
          name={forPerson}
          selfMode={selfMode}
          busy={loading}
          onDone={onSetupDone}
          onBack={back}
          copyFrom={familyMode && person > 0 && first?.answers && first.picks ? { name: first.name, answers: first.answers, picks: first.picks } : undefined}
          doneLabel={familyMode && people.length > 1 ? `Save ${forPerson}'s plan` : undefined}
        />
        {errorLine}
      </div>
    );
  }

  if (stage === 'helpers' && kind === 'supported') {
    return <HelpersStep name={shownName} helpers={helpers} onHelpers={setHelpers} onContinue={() => go(usesApp ? 'login' : 'setup')} onBack={back} />;
  }

  if (stage === 'login' && kind === 'supported') {
    return <LoginStep name={shownName} login={login} onLogin={setLogin} onContinue={() => go('setup')} onBack={back} />;
  }

  if (stage === 'admins' && familyMode) {
    return (
      <>
        <AdminsStep
          admin={secondAdmin}
          onAdmin={setSecondAdmin}
          viewers={helpers}
          onViewers={setHelpers}
          busy={loading}
          onFinish={(viewers) => {
            setHelpers(viewers);
            void create(results, viewers);
          }}
          onBack={back}
        />
        {errorLine}
      </>
    );
  }

  if (familyMode) {
    return (
      <>
        <FamilyStep
          rows={rows}
          onRows={setRows}
          meOn={meOn}
          onMeOn={setMeOn}
          me={me}
          onMe={setMe}
          onContinue={() => {
            // A new list means new answers: never keep a result that belonged to someone who is gone.
            setResults([]);
            go('setup');
          }}
        />
        {errorLine}
      </>
    );
  }

  if (selfMode) {
    return (
      <form className={styles.form} onSubmit={submitWho}>
        <div>
          <h1 className={styles.title}>What should we call you?</h1>
          <p className={styles.subtitle}>This is the name you will see in Chipperly.</p>
        </div>
        <TextField
          label="Your name"
          autoComplete="given-name"
          autoFocus
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {errorLine}
        <Button type="submit" fullWidth disabled={name.trim().length === 0}>
          Continue
        </Button>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={submitWho}>
      <div>
        <h1 className={styles.title}>What&apos;s their name?</h1>
        <p className={styles.subtitle}>Personalize their visual routine workspace.</p>
      </div>
      <TextField label="Name" hint="A first name or nickname is fine. It stays in your account and isn't shared." autoComplete="off" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      <PicturePicker value={picture} onChange={setPicture} name={name} choices={AVATAR_EMOJI} />
      <UsesAppSwitch name={name} checked={usesApp} onChange={setUsesApp} />
      {errorLine}
      <Button type="submit" fullWidth disabled={name.trim().length === 0}>
        Continue
      </Button>
    </form>
  );
}
