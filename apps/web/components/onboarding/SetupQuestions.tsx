'use client';

import { useEffect, useState } from 'react';
import type { AgeBand, FocusRoutine, SetupAnswers } from '@chipperly/shared/schemas/profile';
import { AGE_BAND_TILES, FOCUS_TILES, LOVE_TILES, ROUTINE_TILES, WEEK_TILES, defaultAnswers } from '@chipperly/shared/constants/setup';
import { newId } from '@/lib/ids';
import type { GuidedItem, GuidedPicks, GuidedPlace } from '@/lib/profile/guidedSetup';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PickStep, PlacesStep } from './GuidedSteps';
import styles from './SetupQuestions.module.css';

export interface SetupQuestionsProps {
  name: string;
  /** "Myself" accounts skip the age question and start from the 18+ defaults. */
  selfMode: boolean;
  busy: boolean;
  /** The finished answers and the guided picks to create locally, or null for "Skip setup" (the fixed default lists). */
  onDone: (answers: SetupAnswers | null, picks?: GuidedPicks) => void;
  /** Family and organization accounts: back from the first question to the name form. */
  onBack?: () => void;
}

type MultiKey = 'week' | 'routines';

const LAST_STEP = 5;

/**
 * S4b, the setup interview: age, week and routines seed a starter plan that
 * fits the person (constants/setup.ts buildSeed); then a guided walk through
 * places, three free choices and three earned rewards, which the caller
 * creates locally so photos attach. Every step is skippable; skipping the whole thing keeps the old default lists.
 */
export function SetupQuestions({ name, selfMode, busy, onDone, onBack }: SetupQuestionsProps) {
  const [step, setStep] = useState(selfMode ? 1 : 0);
  const [answers, setAnswers] = useState<SetupAnswers>(() => defaultAnswers(selfMode ? '18+' : '2-7'));
  const [places, setPlaces] = useState<GuidedPlace[]>(() => [{ id: newId(), name: 'Home', emoji: '🏠', photo_id: null }]);
  const [free, setFree] = useState<GuidedItem[]>([]);
  const [earned, setEarned] = useState<GuidedItem[]>([]);
  // "Just one goal for now": null is off (the usual routines grid); picking nothing yet keeps Continue disabled.
  const [goal, setGoal] = useState<{ routine: FocusRoutine | null; name: string } | null>(null);
  const goalReady = goal === null || (goal.routine !== null && (goal.routine !== 'other' || goal.name.trim() !== ''));

  const firstStep = selfMode ? 1 : 0;
  // Under 2: no school/week and no routines steps (a newborn has neither; the plan is a fixed caregiver day).
  const order = (answers.age_band === '0-2' ? [0, 3, 4, 5] : [0, 1, 2, 3, 4, 5]).filter((s) => s >= firstStep);
  const pos = order.indexOf(step);
  const nextStep = order[pos + 1] ?? step;
  const stepLabel = `Step ${pos + 1} of ${order.length}`;

  // Each forward move is a history entry, so the browser Back button (and Back below) goes one step back, not off the page.
  function go(next: number): void {
    setStep(next);
    window.history.pushState({ setupStep: next }, '');
  }
  useEffect(() => {
    const saved: unknown = window.history.state?.setupStep;
    // A reload keeps the entry's old step but not the answers: start over from the first question.
    if (typeof saved === 'number' && saved !== firstStep) window.history.replaceState({ ...window.history.state, setupStep: firstStep }, '');
    function onPop(): void {
      const at: unknown = window.history.state?.setupStep;
      setStep(typeof at === 'number' ? at : firstStep);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [firstStep]);

  function pickBand(band: AgeBand): void {
    // A fresh band resets the pre-checks, so what is on always matches the age.
    setAnswers(defaultAnswers(band));
    go(band === '0-2' ? 3 : 1);
  }

  function toggle(key: MultiKey, value: string): void {
    setAnswers((a) => {
      const list = a[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...a, [key]: next } as SetupAnswers;
    });
  }

  function finish(): void {
    // Blank names are dropped; the first place is always kept (Home if it was cleared).
    const named = places.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() }));
    const kept = named.length > 0 ? named : [{ ...places[0]!, name: 'Home' }];
    // `guided`: the server seeds no locations or rewards; the caller creates these.
    const focus = goal?.routine ? { routine: goal.routine, ...(goal.routine === 'other' ? { name: goal.name.trim() } : {}) } : undefined;
    onDone({ ...answers, places: [], loves: [], guided: true, ...(focus ? { focus } : {}) }, { places: kept, free, earned });
  }

  function multiStep(
    key: MultiKey,
    title: string,
    subtitle: string,
    tiles: readonly { key: string; name: string; emoji: string }[],
  ): React.ReactElement {
    const list = answers[key] as string[];
    return (
      <>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.grid}>
          {tiles.map((tile) => (
            <button key={tile.key} type="button" className={styles.tile} aria-pressed={list.includes(tile.key)} onClick={() => toggle(key, tile.key)}>
              <span className={styles.tileEmoji} aria-hidden="true">
                {tile.emoji}
              </span>
              {tile.name}
              {list.includes(tile.key) ? (
                <span className={styles.tileCheck} aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.stepLabel}>{stepLabel}</p>

      {step === 0 ? (
        <>
          <h1 className={styles.title}>How old is {name}?</h1>
          <p className={styles.subtitle}>Picks a starter plan that fits. You can change everything later.</p>
          <div className={styles.grid}>
            {AGE_BAND_TILES.map((tile) => (
              <button key={tile.key} type="button" className={styles.tile} onClick={() => pickBand(tile.key)}>
                <span className={styles.tileEmoji} aria-hidden="true">
                  {tile.emoji}
                </span>
                {tile.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 1 ? multiStep('week', "What's in a typical week?", 'Pick what applies; none is fine.', WEEK_TILES) : null}
      {step === 2 && goal === null ? (
        <>
          {multiStep('routines', 'Which routines should we start with?', 'Each one becomes a step-by-step routine.', ROUTINE_TILES)}
          <button type="button" className={styles.quietButton} onClick={() => setGoal({ routine: null, name: '' })}>
            Just one goal for now
          </button>
        </>
      ) : null}
      {step === 2 && goal !== null ? (
        <>
          <h1 className={styles.title}>What is the one goal?</h1>
          <p className={styles.subtitle}>We start with just this, and no full daily plan. You can add more any time.</p>
          <div className={styles.grid}>
            {FOCUS_TILES.map((tile) => (
              <button key={tile.key} type="button" className={styles.tile} aria-pressed={goal.routine === tile.key} onClick={() => setGoal({ ...goal, routine: tile.key })}>
                <span className={styles.tileEmoji} aria-hidden="true">
                  {tile.emoji}
                </span>
                {tile.name}
                {goal.routine === tile.key ? (
                  <span className={styles.tileCheck} aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {goal.routine === 'other' ? (
            <TextField label="Name of the goal" value={goal.name} maxLength={60} onChange={(e) => setGoal({ ...goal, name: e.target.value })} />
          ) : null}
          <button type="button" className={styles.quietButton} onClick={() => setGoal(null)}>
            Pick several routines instead
          </button>
        </>
      ) : null}
      {step === 3 ? <PlacesStep name={name} places={places} onChange={setPlaces} /> : null}
      {step === 4 ? (
        <PickStep
          title={`Pick three things ${name} can choose anytime`}
          subtitle="These are always there and need no chips. Pick up to three, or skip this."
          tiles={LOVE_TILES[answers.age_band]}
          items={free}
          onChange={setFree}
          places={places}
          priced={false}
        />
      ) : null}
      {step === 5 ? (
        <PickStep
          title={`Pick three rewards ${name} earns with chips`}
          subtitle={`${name} saves up chips for these. The price is 5 chips unless you change it. Skipping is fine.`}
          tiles={LOVE_TILES[answers.age_band].filter((t) => !free.some((f) => f.name === t.name))}
          items={earned}
          onChange={setEarned}
          places={places}
          priced
        />
      ) : null}

      <div className={styles.actions}>
        {step === LAST_STEP ? (
          <Button fullWidth loading={busy} onClick={finish}>
            Create {name}&apos;s plan
          </Button>
        ) : step > 0 ? (
          <Button fullWidth disabled={step === 2 && !goalReady} onClick={() => go(nextStep)}>
            Continue
          </Button>
        ) : null}
        {step > firstStep ? (
          <button type="button" className={styles.quietButton} onClick={() => window.history.back()}>
            Back
          </button>
        ) : onBack ? (
          <button type="button" className={styles.quietButton} onClick={onBack}>
            Back
          </button>
        ) : null}
        {step === firstStep ? (
          <button type="button" className={styles.quietButton} disabled={busy} onClick={() => onDone(null)}>
            Skip setup
          </button>
        ) : null}
      </div>
    </div>
  );
}
