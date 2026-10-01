import { describe, expect, it } from 'vitest';
import { ROUTINE_TEMPLATES } from '@chipperly/shared/constants/templates';
import { templateToActivityInput, uniqueActivityName } from './templates';

const speech = ROUTINE_TEMPLATES.find((t) => t.key === 'speech')!;

describe('uniqueActivityName', () => {
  it('keeps a free name and numbers a taken one, ignoring case', () => {
    expect(uniqueActivityName('Haircut', ['Bath'])).toBe('Haircut');
    expect(uniqueActivityName('Haircut', ['haircut'])).toBe('Haircut (2)');
    expect(uniqueActivityName('Haircut', ['Haircut', 'Haircut (2)'])).toBe('Haircut (3)');
  });
});

describe('templateToActivityInput', () => {
  const input = templateToActivityInput(speech, 'p1', []);

  it('makes an activity with no recurrence, shown everywhere', () => {
    expect(input).toMatchObject({
      profile_id: 'p1',
      name: 'Speech therapy session',
      emoji: speech.emoji,
      recurrence: null,
      recurrence_weekdays: null,
      recurrence_time: null,
      location_ids: [],
    });
    expect(input.id).toBeUndefined();
  });

  it('makes one root step per template step, in order, with the emoji as the picture', () => {
    expect(input.steps.map((s) => s.name)).toEqual(speech.steps.map((s) => s.name));
    expect(input.steps.map((s) => s.emoji)).toEqual(speech.steps.map((s) => s.emoji));
    for (const step of input.steps) expect(step).toMatchObject({ parent_step_id: null, photo_id: null });
  });

  it('renames when the profile already has that activity', () => {
    expect(templateToActivityInput(speech, 'p1', ['Speech Therapy Session']).name).toBe('Speech therapy session (2)');
  });
});
