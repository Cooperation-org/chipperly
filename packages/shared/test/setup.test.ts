import { describe, expect, it } from 'vitest';
import { buildSeed, defaultAnswers, LOVE_TILES } from '../src/constants/setup.js';
import { SetupAnswersSchema } from '../src/schemas/profile.js';

describe('setup interview seed', () => {
  it('defaultAnswers parse for every band and stay age-appropriate', () => {
    for (const band of ['0-2', '2-7', '8-12', '13-17', '18+'] as const) {
      const answers = SetupAnswersSchema.parse(defaultAnswers(band));
      const plan = buildSeed(answers);
      const names = plan.activities.map((a) => a.name);
      if (band === '18+' || band === '0-2') {
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

  it('keeps the other locations, and the after school tile seeds After School', () => {
    const plan = buildSeed({ ...defaultAnswers('8-12'), week: ['school', 'day_program'], places: ['school', 'therapy'] });
    expect(plan.locations.map((l) => l.name)).toEqual(['Home', 'School', 'Therapy']);
    expect(plan.activities.length).toBeGreaterThan(0);
    expect(plan.activities.some((a) => a.name === 'After School')).toBe(true);
  });

  it('brush teeth and get dressed are morning routine steps, not top-level activities', () => {
    for (const routines of [['morning'], ['dressed', 'teeth'], ['morning', 'dressed', 'teeth', 'bedtime']] as const) {
      const plan = buildSeed({ ...defaultAnswers('2-7'), routines: [...routines] });
      const names = plan.activities.map((a) => a.name);
      expect(names).not.toContain('Brush Teeth');
      expect(names).not.toContain('Getting Dressed');
      expect(names).not.toContain('Get Dressed');
      expect(names).not.toContain('Wake Up');
      expect(names).not.toContain('Breakfast');
      const morning = plan.activities.filter((a) => a.name === 'Morning Routine');
      expect(morning).toHaveLength(1);
      const steps = morning[0]?.steps?.map((s) => s.name) ?? [];
      expect(steps).toEqual(['Wake Up', 'Bathroom', 'Brush Teeth', 'Get Dressed', 'Breakfast', 'Put Shoes On']);
    }
  });

  it('without any morning tile, wake up and breakfast stay as plain activities', () => {
    const names = buildSeed({ ...defaultAnswers('2-7'), routines: ['bedtime'] }).activities.map((a) => a.name);
    expect(names).toContain('Wake Up');
    expect(names).not.toContain('Morning Routine');
  });

  it('the 0-2 band seeds a caregiver-led day with no school and no steps', () => {
    const answers = SetupAnswersSchema.parse(defaultAnswers('0-2'));
    const plan = buildSeed(answers);
    const names = plan.activities.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Morning Feed', 'Nappy Change', 'Nap', 'Bath', 'Sleep']));
    expect(names).not.toContain('Go to School');
    expect(plan.activities.some((a) => a.steps)).toBe(false);
    expect(plan.locations.map((l) => l.name)).toEqual(['Home']);
    expect(plan.rewards.length).toBeGreaterThan(1);
  });

  it('the toilet training pack is available to any band', () => {
    for (const band of ['0-2', '2-7', '13-17', '18+'] as const) {
      const plan = buildSeed({ ...defaultAnswers(band), routines: ['toilet'] });
      const pack = plan.activities.find((a) => a.name === 'Using the Toilet');
      expect(pack?.steps?.map((s) => s.name)).toEqual([
        'Go to the Bathroom',
        'Pull Down',
        'Sit and Try',
        'Wipe',
        'Flush',
        'Pull Up',
        'Wash Hands',
      ]);
    }
  });

  it('spreads repeating activities across morning, afternoon and evening', () => {
    for (const band of ['0-2', '2-7', '8-12', '13-17', '18+'] as const) {
      const parts = new Set(
        buildSeed(defaultAnswers(band))
          .activities.filter((a) => a.recurrence_time)
          .map((a) => {
            const hour = Number(a.recurrence_time?.slice(0, 2));
            return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
          }),
      );
      expect([...parts].sort()).toEqual(['afternoon', 'evening', 'morning']);
    }
  });
});
