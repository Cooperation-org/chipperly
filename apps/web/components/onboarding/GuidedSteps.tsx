'use client';

import { useState } from 'react';
import { COST_MAX } from '@chipperly/shared/constants/limits';
import { newId } from '@/lib/ids';
import { DEFAULT_EARNED_COST, MAX_PICKS, placeIdsFor, togglePlace, type GuidedItem, type GuidedPlace } from '@/lib/profile/guidedSetup';
import { PicturePicker } from '@/components/picture/PicturePicker';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { TextField } from '@/components/ui/TextField';
import setup from './SetupQuestions.module.css';
import styles from './GuidedSteps.module.css';

export interface PlacesStepProps {
  name: string;
  places: GuidedPlace[];
  onChange: (next: GuidedPlace[]) => void;
}

/** Guided setup (a): name the main place and optionally one more, each with an optional picture. */
export function PlacesStep({ name, places, onChange }: PlacesStepProps) {
  function update(index: number, patch: Partial<GuidedPlace>): void {
    onChange(places.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  return (
    <>
      <h1 className={setup.title}>Where will {name} use Chipperly?</h1>
      <p className={setup.subtitle}>Name the main place. You can add a photo of it, and one more place such as school.</p>
      {places.map((place, index) => (
        <section key={place.id} className={styles.card} aria-label={index === 0 ? 'Main place' : 'Second place'}>
          <TextField label={index === 0 ? 'Main place' : 'Another place'} value={place.name} maxLength={60} onChange={(e) => update(index, { name: e.target.value })} />
          <PicturePicker value={place} onChange={(v) => update(index, { emoji: v.emoji ?? place.emoji, photo_id: v.photo_id ?? null })} name={place.name} />
          {index > 0 ? (
            <Button variant="secondary" onClick={() => onChange(places.filter((_, i) => i !== index))}>
              Remove {place.name.trim() || 'this place'}
            </Button>
          ) : null}
        </section>
      ))}
      {places.length < 2 ? (
        <Button variant="secondary" onClick={() => onChange([...places, { id: newId(), name: 'School', emoji: '🏫', photo_id: null }])}>
          Add another place
        </Button>
      ) : null}
    </>
  );
}

export interface PickStepProps {
  title: string;
  subtitle: string;
  /** Suggestions already filtered (nothing picked in an earlier step). */
  tiles: readonly { name: string; emoji: string }[];
  items: GuidedItem[];
  onChange: (next: GuidedItem[]) => void;
  places: readonly GuidedPlace[];
  /** Earned rewards have a chip price; free choices do not. */
  priced: boolean;
}

/** Guided setup (b) and (c): pick up to three from suggestions or type your own; each gets a picture, a place and (earned) a price. */
export function PickStep({ title, subtitle, tiles, items, onChange, places, priced }: PickStepProps) {
  const [custom, setCustom] = useState('');
  const full = items.length >= MAX_PICKS;
  const shown = [...tiles, ...items.filter((i) => !tiles.some((t) => t.name === i.name))];

  function add(tile: { name: string; emoji: string }): void {
    onChange([
      ...items,
      { name: tile.name, emoji: tile.emoji, photo_id: null, chip_cost: priced ? DEFAULT_EARNED_COST : null, location_ids: places[0] ? [places[0].id] : [] },
    ]);
  }
  function toggle(tile: { name: string; emoji: string }): void {
    if (items.some((i) => i.name === tile.name)) onChange(items.filter((i) => i.name !== tile.name));
    else if (!full) add(tile);
  }
  function addCustom(): void {
    const trimmed = custom.trim();
    if (!trimmed || full || items.some((i) => i.name === trimmed)) return;
    add({ name: trimmed, emoji: '⭐' });
    setCustom('');
  }
  function update(name: string, patch: Partial<GuidedItem>): void {
    onChange(items.map((i) => (i.name === name ? { ...i, ...patch } : i)));
  }

  return (
    <>
      <h1 className={setup.title}>{title}</h1>
      <p className={setup.subtitle}>{subtitle}</p>
      <div className={setup.grid}>
        {shown.map((tile) => {
          const on = items.some((i) => i.name === tile.name);
          return (
            <button key={tile.name} type="button" className={setup.tile} aria-pressed={on} disabled={!on && full} onClick={() => toggle(tile)}>
              <span className={setup.tileEmoji} aria-hidden="true">
                {tile.emoji}
              </span>
              {tile.name}
              {on ? (
                <span className={setup.tileCheck} aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className={styles.count} role="status">
        {items.length} of {MAX_PICKS} picked
      </p>
      <div className={setup.customRow}>
        <TextField label="Add your own" value={custom} disabled={full} maxLength={60} onChange={(e) => setCustom(e.target.value)} />
        <Button variant="secondary" onClick={addCustom} disabled={full || custom.trim().length === 0}>
          Add
        </Button>
      </div>
      {items.map((item) => (
        <section key={item.name} className={styles.card} aria-label={item.name}>
          <h2 className={styles.cardTitle}>{item.name}</h2>
          <PicturePicker value={item} onChange={(v) => update(item.name, { emoji: v.emoji ?? item.emoji, photo_id: v.photo_id ?? null })} name={item.name} />
          {priced ? <Stepper label={`Chips for ${item.name}`} value={item.chip_cost ?? DEFAULT_EARNED_COST} min={1} max={COST_MAX} onChange={(n) => update(item.name, { chip_cost: n })} /> : null}
          {places.length > 1 ? (
            <div role="group" aria-label={`Where ${item.name} is offered`} className={styles.chips}>
              {places.map((place) => {
                const ids = placeIdsFor(item, places);
                return (
                  <button
                    key={place.id}
                    type="button"
                    className={styles.chip}
                    aria-pressed={ids.includes(place.id)}
                    onClick={() => update(item.name, { location_ids: togglePlace(ids, place.id) })}
                  >
                    {place.name.trim() || 'Place'}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
