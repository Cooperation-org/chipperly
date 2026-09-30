'use client';

import { useState } from 'react';
import type { AgeBand, SetupAnswers } from '@chipperly/shared/schemas/profile';
import { AGE_BAND_TILES, LOVE_TILES, PLACE_TILES, ROUTINE_TILES, WEEK_TILES, defaultAnswers } from '@chipperly/shared/constants/setup';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import styles from './SetupQuestions.module.css';

export interface SetupQuestionsProps {
  name: string;
  /** "Myself" accounts skip the age question and start from the 18+ defaults. */
  selfMode: boolean;
  busy: boolean;
  /** The finished answers, or null for "Skip setup" (the fixed default lists). */
  onDone: (answers: SetupAnswers | null) => void;
  /** Family and organization accounts: back from the first question to the name form. */
  onBack?: () => void;
}

type MultiKey = 'week' | 'routines' | 'places';

/**
 * S4b, the setup interview: five picture-tile questions whose answers seed a
 * starter plan that fits the person (constants/setup.ts buildSeed). Every
 * step is skippable; skipping the whole thing keeps the old default lists.
 */
export function SetupQuestions({ name, selfMode, busy, onDone, onBack }: SetupQuestionsProps) {
  const [step, setStep] = useState(selfMode ? 1 : 0);
  const [answers, setAnswers] = useState<SetupAnswers>(() => defaultAnswers(selfMode ? '18+' : '2-7'));
  const [custom, setCustom] = useState('');

  const firstStep = selfMode ? 1 : 0;
  // Under 2: no school/week and no routines steps (a newborn has neither; the plan is a fixed caregiver day).
  const order = (answers.age_band === '0-2' ? [0, 3, 4] : [0, 1, 2, 3, 4]).filter((s) => s >= firstStep);
  const pos = order.indexOf(step);
  const nextStep = order[pos + 1] ?? step;
  const prevStep = order[pos - 1] ?? step;
  const stepLabel = `Step ${pos + 1} of ${order.length}`;

  function pickBand(band: AgeBand): void {
    // A fresh band resets the pre-checks, so what is on always matches the age.
    setAnswers(defaultAnswers(band));
    setStep(band === '0-2' ? 3 : 1);
  }

  function toggle(key: MultiKey, value: string): void {
    setAnswers((a) => {
      const list = a[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...a, [key]: next } as SetupAnswers;
    });
  }

  function toggleLove(tile: { name: string; emoji: string }): void {
    setAnswers((a) => {
      const on = a.loves.some((l) => l.name === tile.name);
      return { ...a, loves: on ? a.loves.filter((l) => l.name !== tile.name) : [...a.loves, tile] };
    });
  }

  function addCustomLove(): void {
    const trimmed = custom.trim();
    if (!trimmed) return;
    setAnswers((a) => (a.loves.some((l) => l.name === trimmed) ? a : { ...a, loves: [...a.loves, { name: trimmed, emoji: '⭐' }] }));
    setCustom('');
  }

  // The love tiles: the band's suggestions plus anything typed in.
  const loveTiles = [...LOVE_TILES[answers.age_band], ...answers.loves.filter((l) => !LOVE_TILES[answers.age_band].some((t) => t.name === l.name))];

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
      {step === 2 ? multiStep('routines', 'Which routines should we start with?', 'Each one becomes a step-by-step routine.', ROUTINE_TILES) : null}
      {step === 3 ? multiStep('places', 'Where will you use Chipperly?', 'Home is always included.', PLACE_TILES) : null}

      {step === 4 ? (
        <>
          <h1 className={styles.title}>What does {name} love?</h1>
          <p className={styles.subtitle}>These become the rewards to work for.</p>
          <div className={styles.grid}>
            {loveTiles.map((tile) => (
              <button
                key={tile.name}
                type="button"
                className={styles.tile}
                aria-pressed={answers.loves.some((l) => l.name === tile.name)}
                onClick={() => toggleLove(tile)}
              >
                <span className={styles.tileEmoji} aria-hidden="true">
                  {tile.emoji}
                </span>
                {tile.name}
                {answers.loves.some((l) => l.name === tile.name) ? (
                  <span className={styles.tileCheck} aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className={styles.customRow}>
            <TextField label="Add your own" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Button variant="secondary" onClick={addCustomLove} disabled={custom.trim().length === 0}>
              Add
            </Button>
          </div>
        </>
      ) : null}

      <div className={styles.actions}>
        {step === 4 ? (
          <Button fullWidth loading={busy} onClick={() => onDone(answers)}>
            Create {name}&apos;s plan
          </Button>
        ) : step > 0 ? (
          <Button fullWidth onClick={() => setStep(nextStep)}>
            Continue
          </Button>
        ) : null}
        {step > firstStep ? (
          <button type="button" className={styles.quietButton} onClick={() => setStep(prevStep)}>
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
