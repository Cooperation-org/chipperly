import { saveLocation } from '../data/locations';
import { saveReward } from '../data/rewards';

/** A place named in the guided setup; the id is made up front so picks can point at it before anything is saved. */
export interface GuidedPlace {
  id: string;
  name: string;
  emoji: string;
  photo_id: string | null;
}

/** A free choice (chip_cost null) or an earned reward, with the places it shows in. */
export interface GuidedItem {
  name: string;
  emoji: string;
  photo_id: string | null;
  chip_cost: number | null;
  location_ids: string[];
}

export interface GuidedPicks {
  places: GuidedPlace[];
  free: GuidedItem[];
  earned: GuidedItem[];
}

export const DEFAULT_EARNED_COST = 5;
export const MAX_PICKS = 3;

/** Pure: the item's places that still exist; never empty (falls back to the first place) so nothing is left unassigned. */
export function placeIdsFor(item: GuidedItem, places: readonly GuidedPlace[]): string[] {
  const kept = item.location_ids.filter((id) => places.some((p) => p.id === id));
  const first = places[0]?.id;
  return kept.length > 0 ? kept : first ? [first] : [];
}

/** Pure: toggles one place on an item's list, keeping at least one. */
export function togglePlace(ids: readonly string[], id: string): string[] {
  if (!ids.includes(id)) return [...ids, id];
  return ids.length > 1 ? ids.filter((x) => x !== id) : [...ids];
}

/**
 * Creates the chosen locations, free choices and rewards through the normal
 * data helpers, so they go through the outbox and sync like anything the
 * caregiver adds later. The server made none of them (SetupAnswers.guided),
 * so nothing is duplicated when sync pulls.
 */
export async function saveGuidedSetup(profileId: string, picks: GuidedPicks): Promise<void> {
  for (const place of picks.places) {
    await saveLocation({ id: place.id, profile_id: profileId, name: place.name, emoji: place.emoji, photo_id: place.photo_id, chip_goal: 5 });
  }
  for (const item of [...picks.free, ...picks.earned]) {
    await saveReward({
      profile_id: profileId,
      name: item.name,
      emoji: item.emoji,
      photo_id: item.photo_id,
      chip_cost: item.chip_cost,
      location_ids: placeIdsFor(item, picks.places),
      always_available: item.chip_cost === null,
    });
  }
}
