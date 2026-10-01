import { describe, expect, it } from 'vitest';
import { buildSeed, defaultAnswers, FOCUS_TILES, LOVE_TILES } from '../src/constants/setup.js';
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

  it('guided answers seed routines only: no locations, no rewards, no Free Choice', () => {
    const guided = { ...defaultAnswers('8-12'), guided: true };
    expect(SetupAnswersSchema.parse(guided).guided).toBe(true);
    const plan = buildSeed(guided);
    expect(plan.locations).toEqual([]);
    expect(plan.rewards).toEqual([]);
    expect(plan.activities.length).toBeGreaterThan(0);
    // An old payload (no `guided`) validates and seeds as before.
    expect(SetupAnswersSchema.parse(defaultAnswers('8-12')).guided).toBeUndefined();
    expect(buildSeed(defaultAnswers('8-12')).rewards.some((r) => r.name === 'Free Choice')).toBe(true);
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

  it('the speech and ABA session packs seed steps and are accepted by the schema', () => {
    const plan = buildSeed({ ...defaultAnswers('2-7'), routines: ['speech', 'aba'] });
    const speech = plan.activities.find((a) => a.name === 'Speech Therapy Session');
    expect(speech?.steps?.map((s) => s.name)).toEqual(['Warm Up', 'Practice Sounds', 'Practice Words', 'Play a Game', 'All Done']);
    const aba = plan.activities.find((a) => a.name === 'ABA Session');
    expect(aba?.steps?.map((s) => s.name)).toEqual([
      'Say Hello and Play',
      'Table Work',
      'Break',
      'Play and Practice',
      'Choose a Reward',
      'All Done',
    ]);
    expect(SetupAnswersSchema.safeParse({ ...defaultAnswers('2-7'), routines: ['speech', 'aba'] }).success).toBe(true);
    expect(defaultAnswers('2-7').routines).not.toContain('speech');
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

describe('setup interview: just one goal', () => {
  it('seeds only the chosen routine with its steps and no filler day', () => {
    const answers = SetupAnswersSchema.parse({ ...defaultAnswers('2-7'), guided: true, focus: { routine: 'toilet' } });
    const plan = buildSeed(answers);
    expect(plan.activities.map((a) => a.name)).toEqual(['Using the Toilet']);
    expect(plan.activities[0]?.steps?.length).toBeGreaterThan(3);
    expect(plan.activities[0]?.recurrence).toBe('daily');
    expect(plan.rewards).toEqual([]);
  });

  it('ignores the week answers, so school adds nothing', () => {
    const plan = buildSeed({ ...defaultAnswers('8-12'), week: ['school', 'work'], focus: { routine: 'bedtime' } });
    expect(plan.activities.map((a) => a.name)).toEqual(['Bedtime Routine']);
    expect(plan.activities[0]?.recurrence_time).toBe('20:00');
    // Not guided: the normal places and rewards stay.
    expect(plan.rewards.some((r) => r.name === 'Free Choice')).toBe(true);
  });

  it('covers every goal tile; getting dressed and brushing teeth get steps', () => {
    for (const tile of FOCUS_TILES) {
      const plan = buildSeed({ ...defaultAnswers('2-7'), focus: { routine: tile.key, name: 'Reading' } });
      expect(plan.activities).toHaveLength(1);
      if (tile.key !== 'other') expect(plan.activities[0]?.steps?.length).toBeGreaterThan(0);
    }
  });

  it('"Something else" is an empty activity with the typed name', () => {
    const plan = buildSeed({ ...defaultAnswers('13-17'), focus: { routine: 'other', name: '  Practice piano ' } });
    expect(plan.activities).toEqual([{ name: 'Practice piano', emoji: '🎯', recurrence: 'daily' }]);
    expect(SetupAnswersSchema.safeParse({ ...defaultAnswers('13-17'), focus: { routine: 'other', name: '' } }).success).toBe(false);
  });

  it('old payloads without focus are unchanged', () => {
    expect(SetupAnswersSchema.parse(defaultAnswers('8-12')).focus).toBeUndefined();
    expect(buildSeed(defaultAnswers('8-12')).activities.map((a) => a.name)).toContain('Lunch');
  });
});
