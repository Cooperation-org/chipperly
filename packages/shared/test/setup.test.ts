import { describe, expect, it } from 'vitest';
import { buildSeed, defaultAnswers, LOVE_TILES } from '../src/constants/setup.js';
import { SetupAnswersSchema } from '../src/schemas/profile.js';

describe('setup interview seed', () => {
  it('defaultAnswers parse for every band and stay age-appropriate', () => {
    for (const band of ['2-7', '8-12', '13-17', '18+'] as const) {
      const answers = SetupAnswersSchema.parse(defaultAnswers(band));
      const plan = buildSeed(answers);
      const names = plan.activities.map((a) => a.name);
      if (band === '18+') {
        expect(names).not.toContain('Go to School');
        expect(plan.locations.map((l) => l.name)).toEqual(['Home']);
      } else {
        expect(names).toContain('Go to School');
        expect(plan.locations.map((l) => l.name)).toContain('School');
      }
      // No babyish rewards outside the youngest bands.
      if (band === '13-17' || band === '18+') {
        expect(plan.rewards.map((r) => r.name)).not.toContain('Toys');
      }
    }
  });

  it('a picked routine seeds steps and its band variant', () => {
    const young = buildSeed({ ...defaultAnswers('2-7'), routines: ['bedtime'] });
    const bedtimeYoung = young.activities.find((a) => a.name === 'Bedtime Routine');
    expect(bedtimeYoung?.steps?.map((s) => s.name)).toContain('Story');
    expect(bedtimeYoung?.recurrence_time).toBe('19:00');

    const teen = buildSeed({ ...defaultAnswers('13-17'), routines: ['bedtime'] });
    const bedtimeTeen = teen.activities.find((a) => a.name === 'Bedtime Routine');
    expect(bedtimeTeen?.steps?.map((s) => s.name)).toContain('Phone Away');
    expect(bedtimeTeen?.recurrence_time).toBe('21:30');
  });

  it('screen time expands to the timed rewards and Free Choice is always available', () => {
    const plan = buildSeed({ ...defaultAnswers('8-12'), loves: [LOVE_TILES['8-12'][0]!] });
    expect(plan.rewards.filter((r) => r.screen_time_minutes)).toHaveLength(3);
    const freeChoice = plan.rewards.find((r) => r.name === 'Free Choice');
    expect(freeChoice?.always_available).toBe(true);
  });
});
