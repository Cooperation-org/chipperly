import type { ProfileSettings } from '@chipperly/shared/schemas/profile';

export type Panel = 'first' | 'then';

export const AUDIO_KEY = {
  first: 'first_then_first_audio_id',
  then: 'first_then_then_audio_id',
} as const;

/**
 * Settings after a panel's audio changes. A recording belongs to the thing it
 * names, so choosing a different activity/reward drops the old voice clip.
 */
export function settingsWithAudio(settings: ProfileSettings, panel: Panel, audioId: string | null): ProfileSettings {
  return { ...settings, [AUDIO_KEY[panel]]: audioId };
}

export function settingsAfterPick(
  settings: ProfileSettings,
  panel: Panel,
  currentId: string | null,
  nextId: string | null,
): ProfileSettings {
  return currentId === nextId ? settings : settingsWithAudio(settings, panel, null);
}
