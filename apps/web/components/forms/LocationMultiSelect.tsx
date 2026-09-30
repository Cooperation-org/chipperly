'use client';

import styles from './LocationMultiSelect.module.css';

export interface LocationChoice {
  id: string;
  name: string;
}

export interface LocationMultiSelectProps {
  locations: readonly LocationChoice[];
  everyPlace: boolean;
  placeIds: readonly string[];
  onChange: (next: { everyPlace: boolean; placeIds: string[] }) => void;
  /** What the choice applies to, for the hint text ("activity" / "reward"). */
  noun: string;
}

/** True when "Every place" is off and no existing place is ticked; the form must not save that. */
export function nothingPicked(locations: readonly LocationChoice[], everyPlace: boolean, placeIds: readonly string[]): boolean {
  return !everyPlace && !placeIds.some((id) => locations.some((l) => l.id === id));
}

/** Where summary text for a FormRow. */
export function whereSummary(locations: readonly LocationChoice[], everyPlace: boolean, placeIds: readonly string[]): string {
  if (everyPlace) return 'Every place';
  const names = locations.filter((l) => placeIds.includes(l.id)).map((l) => l.name);
  return names.length ? names.join(', ') : 'No place picked';
}

/**
 * "Every place" and "picked places" are different answers. Every place shows
 * the row in each place; picked places show it only there; nothing picked is
 * not saveable (the form disables Save), since it would hide the row everywhere.
 */
export function LocationMultiSelect({ locations, everyPlace, placeIds, onChange, noun }: LocationMultiSelectProps) {
  return (
    <div className={styles.wrap}>
      <label className={everyPlace ? styles.everyOn : styles.every}>
        <input
          type="checkbox"
          className={styles.box}
          checked={everyPlace}
          onChange={(e) => onChange({ everyPlace: e.target.checked, placeIds: [...placeIds] })}
        />
        <span className={styles.everyText}>
          <span className={styles.everyName}>Every place</span>
          <span className={styles.hint}>This {noun} shows up wherever you are.</span>
        </span>
      </label>
      {everyPlace ? null : (
        <fieldset className={styles.list}>
          <legend className={styles.legend}>Only in these places</legend>
          {locations.map((l) => (
            <label key={l.id} className={styles.place}>
              <input
                type="checkbox"
                className={styles.box}
                checked={placeIds.includes(l.id)}
                onChange={(e) =>
                  onChange({
                    everyPlace: false,
                    placeIds: e.target.checked ? [...placeIds, l.id] : placeIds.filter((id) => id !== l.id),
                  })
                }
              />
              <span>{l.name}</span>
            </label>
          ))}
          {nothingPicked(locations, everyPlace, placeIds) ? (
            <p className={styles.warn} role="alert">
              Pick at least one place, or choose Every place. With nothing picked, this {noun} would not show anywhere.
            </p>
          ) : null}
        </fieldset>
      )}
    </div>
  );
}
