import type { RoutineTemplate } from '@chipperly/shared/constants/templates';
import { db } from '../db/db';
import { saveActivity, type SaveActivityInput } from './activities';

/** Pure: "Doctor visit", or "Doctor visit (2)", (3)... when the profile already has one (case-insensitive). */
export function uniqueActivityName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`.toLowerCase())) n += 1;
  return `${name} (${n})`;
}

/** Pure: the activity-with-steps a template becomes. No recurrence (the caregiver picks days next); steps are root steps with their emoji as the picture. */
export function templateToActivityInput(
  template: RoutineTemplate,
  profileId: string,
  existingNames: readonly string[],
): SaveActivityInput {
  return {
    profile_id: profileId,
    name: uniqueActivityName(template.name, existingNames),
    emoji: template.emoji,
    photo_id: null,
    chip_value: 1,
    location_ids: [],
    recurrence: null,
    recurrence_weekdays: null,
    recurrence_time: null,
    goal_text: null,
    goal_reward_id: null,
    steps: template.steps.map((step) => ({
      parent_step_id: null,
      name: step.name,
      emoji: step.emoji,
      photo_id: null,
      duration_minutes: step.duration_minutes ?? null,
    })),
  };
}

/** Adds a template to the profile as an ordinary, editable activity. Returns its id. */
export async function addTemplate(template: RoutineTemplate, profileId: string): Promise<string> {
  const rows = await db.activities.where('profile_id').equals(profileId).toArray();
  const names = rows.filter((row) => row.deleted_at === null).map((row) => row.name);
  return saveActivity(templateToActivityInput(template, profileId, names));
}
