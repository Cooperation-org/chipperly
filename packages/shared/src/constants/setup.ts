/**
 * The setup interview (onboarding S4b): the question tiles the web shows and
 * `buildSeed`, which turns the answers into the starter locations, activities,
 * routines (activities with steps) and rewards for one profile. Used by the
 * API to insert (seed/seedProfile.ts) and by the web's Ready screen to show
 * what was made, so both always agree. Skipping the interview keeps the old
 * fixed lists in defaults.ts.
 */
import type { AgeBand, SetupAnswers } from '../schemas/profile.js';

export interface SeedStep {
  readonly name: string;
  readonly emoji: string;
  readonly duration_minutes?: number;
}

export interface SeedActivity {
  readonly name: string;
  readonly emoji: string;
  readonly recurrence?: 'daily' | 'weekdays' | 'weekends';
  readonly recurrence_time?: string;
  readonly steps?: readonly SeedStep[];
}

export interface SeedReward {
  readonly name: string;
  readonly emoji: string;
  readonly chip_cost: number;
  readonly always_available?: boolean;
  readonly screen_time_minutes?: number;
}

export interface SeedPlan {
  readonly locations: readonly { name: string; emoji: string }[];
  readonly activities: readonly SeedActivity[];
  readonly rewards: readonly SeedReward[];
}

interface Tile<K extends string = string> {
  readonly key: K;
  readonly name: string;
  readonly emoji: string;
}

export const AGE_BAND_TILES: readonly Tile<AgeBand>[] = [
  { key: '2-7', name: '2 to 7', emoji: '🧒' },
  { key: '8-12', name: '8 to 12', emoji: '🚲' },
  { key: '13-17', name: '13 to 17', emoji: '🎧' },
  { key: '18+', name: '18 and up', emoji: '🙂' },
];

export const WEEK_TILES: readonly Tile<SetupAnswers['week'][number]>[] = [
  { key: 'school', name: 'School', emoji: '🏫' },
  { key: 'work', name: 'Work', emoji: '💼' },
  { key: 'therapy', name: 'Therapy sessions', emoji: '🧩' },
  { key: 'day_program', name: 'Day program', emoji: '🏢' },
];

export const ROUTINE_TILES: readonly Tile<SetupAnswers['routines'][number]>[] = [
  { key: 'morning', name: 'Morning routine', emoji: '☀️' },
  { key: 'dressed', name: 'Getting dressed', emoji: '👕' },
  { key: 'teeth', name: 'Brushing teeth', emoji: '🪥' },
  { key: 'meals', name: 'Mealtimes', emoji: '🍽️' },
  { key: 'homework', name: 'Homework', emoji: '📝' },
  { key: 'chores', name: 'Chores', emoji: '🧹' },
  { key: 'bedtime', name: 'Bedtime', emoji: '🌙' },
  { key: 'leaving', name: 'Leaving the house', emoji: '🎒' },
];

export const PLACE_TILES: readonly Tile<SetupAnswers['places'][number]>[] = [
  { key: 'school', name: 'School', emoji: '🏫' },
  { key: 'work', name: 'Work', emoji: '💼' },
  { key: 'therapy', name: 'Therapy', emoji: '🧩' },
  { key: 'other_home', name: 'Another home', emoji: '🏡' },
];

/** Reward tiles per age band; "Screen time" expands into the three timed rewards below. */
export const LOVE_TILES: Readonly<Record<AgeBand, readonly { name: string; emoji: string }[]>> = {
  '2-7': [
    { name: 'Screen time', emoji: '📱' },
    { name: 'Snack', emoji: '🍎' },
    { name: 'Playground', emoji: '🌳' },
    { name: 'Toys', emoji: '🧸' },
    { name: 'A story', emoji: '📖' },
    { name: 'Music', emoji: '🎵' },
  ],
  '8-12': [
    { name: 'Screen time', emoji: '📱' },
    { name: 'Video games', emoji: '🎮' },
    { name: 'Snack', emoji: '🍎' },
    { name: 'Outside play', emoji: '⚽' },
    { name: 'Art', emoji: '🎨' },
    { name: 'Movie time', emoji: '🎬' },
  ],
  '13-17': [
    { name: 'Screen time', emoji: '📱' },
    { name: 'Gaming', emoji: '🎮' },
    { name: 'Music', emoji: '🎵' },
    { name: 'Going out', emoji: '🚶' },
    { name: 'Pocket money', emoji: '💵' },
    { name: 'Pizza night', emoji: '🍕' },
  ],
  '18+': [
    { name: 'Screen time', emoji: '📱' },
    { name: 'Music', emoji: '🎵' },
    { name: 'Going out', emoji: '🚶' },
    { name: 'Coffee', emoji: '☕' },
    { name: 'Movie night', emoji: '🎬' },
    { name: 'Takeout', emoji: '🍕' },
  ],
};

/** Which tiles start pre-checked per band; every step can still be changed or skipped. */
export function defaultAnswers(age_band: AgeBand): SetupAnswers {
  const young = age_band === '2-7' || age_band === '8-12';
  return {
    age_band,
    week: age_band === '18+' ? [] : ['school'],
    routines: young ? ['morning', 'bedtime'] : ['morning'],
    places: age_band === '18+' ? [] : ['school'],
    loves: [...LOVE_TILES[age_band]],
  };
}

const SLEEP_TIME: Record<AgeBand, string> = { '2-7': '19:30', '8-12': '20:30', '13-17': '22:00', '18+': '22:30' };
const BEDTIME_TIME: Record<AgeBand, string> = { '2-7': '19:00', '8-12': '20:00', '13-17': '21:30', '18+': '22:00' };

interface RoutinePack {
  readonly name: string;
  readonly emoji: string;
  readonly recurrence?: 'daily' | 'weekdays';
  readonly recurrence_time?: string;
  readonly young: readonly SeedStep[];
  readonly older: readonly SeedStep[];
}

const ROUTINE_PACKS: Record<SetupAnswers['routines'][number], RoutinePack> = {
  morning: {
    name: 'Morning Routine',
    emoji: '☀️',
    recurrence: 'daily',
    recurrence_time: '06:30',
    young: [
      { name: 'Wake Up', emoji: '⏰' },
      { name: 'Bathroom', emoji: '🚽' },
      { name: 'Brush Teeth', emoji: '🪥' },
      { name: 'Get Dressed', emoji: '👕' },
      { name: 'Breakfast', emoji: '🍳' },
      { name: 'Put Shoes On', emoji: '👟' },
    ],
    older: [
      { name: 'Wake Up', emoji: '⏰' },
      { name: 'Shower', emoji: '🚿' },
      { name: 'Brush Teeth', emoji: '🪥' },
      { name: 'Get Dressed', emoji: '👕' },
      { name: 'Breakfast', emoji: '🍳' },
      { name: 'Pack Bag', emoji: '🎒' },
    ],
  },
  dressed: {
    name: 'Getting Dressed',
    emoji: '👕',
    young: [
      { name: 'Pick Clothes', emoji: '👕' },
      { name: 'Top', emoji: '👕' },
      { name: 'Bottoms', emoji: '👖' },
      { name: 'Socks', emoji: '🧦' },
      { name: 'Shoes', emoji: '👟' },
    ],
    older: [
      { name: 'Pick Clothes', emoji: '👕' },
      { name: 'Get Dressed', emoji: '👖' },
      { name: 'Socks and Shoes', emoji: '👟' },
    ],
  },
  teeth: {
    name: 'Brush Teeth',
    emoji: '🪥',
    young: [
      { name: 'Wet the Brush', emoji: '🚰' },
      { name: 'Toothpaste On', emoji: '🧴' },
      { name: 'Brush', emoji: '🪥', duration_minutes: 2 },
      { name: 'Rinse', emoji: '💧' },
    ],
    older: [
      { name: 'Toothpaste On', emoji: '🧴' },
      { name: 'Brush', emoji: '🪥', duration_minutes: 2 },
      { name: 'Rinse', emoji: '💧' },
    ],
  },
  meals: {
    name: 'Mealtime',
    emoji: '🍽️',
    young: [
      { name: 'Wash Hands', emoji: '🧼' },
      { name: 'Sit Down', emoji: '🪑' },
      { name: 'Eat', emoji: '🍴' },
      { name: 'Clear My Plate', emoji: '🧹' },
    ],
    older: [
      { name: 'Wash Hands', emoji: '🧼' },
      { name: 'Set the Table', emoji: '🍽️' },
      { name: 'Eat', emoji: '🍴' },
      { name: 'Clear Up', emoji: '🧹' },
    ],
  },
  homework: {
    name: 'Homework',
    emoji: '📝',
    recurrence: 'weekdays',
    recurrence_time: '16:00',
    young: [
      { name: 'Get Books Out', emoji: '📚' },
      { name: 'Do Homework', emoji: '📝', duration_minutes: 20 },
      { name: 'Pack Bag', emoji: '🎒' },
    ],
    older: [
      { name: 'Get Books Out', emoji: '📚' },
      { name: 'Do Homework', emoji: '📝', duration_minutes: 30 },
      { name: 'Pack Bag', emoji: '🎒' },
    ],
  },
  chores: {
    name: 'Chores',
    emoji: '🧹',
    recurrence: 'daily',
    recurrence_time: '17:00',
    young: [
      { name: 'Tidy Toys', emoji: '🧸' },
      { name: 'Make My Bed', emoji: '🛏️' },
    ],
    older: [
      { name: 'Make My Bed', emoji: '🛏️' },
      { name: 'Take Out Trash', emoji: '🗑️' },
      { name: 'Dishes', emoji: '🍽️' },
    ],
  },
  bedtime: {
    name: 'Bedtime Routine',
    emoji: '🌙',
    recurrence: 'daily',
    young: [
      { name: 'Bath', emoji: '🛁' },
      { name: 'Pajamas On', emoji: '🩳' },
      { name: 'Brush Teeth', emoji: '🪥' },
      { name: 'Story', emoji: '📖' },
      { name: 'Lights Out', emoji: '💡' },
    ],
    older: [
      { name: 'Shower', emoji: '🚿' },
      { name: 'Pajamas On', emoji: '🩳' },
      { name: 'Brush Teeth', emoji: '🪥' },
      { name: 'Phone Away', emoji: '📵' },
      { name: 'Lights Out', emoji: '💡' },
    ],
  },
  leaving: {
    name: 'Leaving the House',
    emoji: '🚪',
    young: [
      { name: 'Bathroom', emoji: '🚽' },
      { name: 'Shoes On', emoji: '👟' },
      { name: 'Jacket On', emoji: '🧥' },
      { name: 'Grab My Bag', emoji: '🎒' },
      { name: 'Out the Door', emoji: '🚪' },
    ],
    older: [
      { name: 'Shoes On', emoji: '👟' },
      { name: 'Keys and Phone', emoji: '🔑' },
      { name: 'Grab My Bag', emoji: '🎒' },
      { name: 'Out the Door', emoji: '🚪' },
    ],
  },
};

const SCREEN_TIME_REWARDS: readonly SeedReward[] = [
  { name: 'Screen Time - 15 min', emoji: '📱', chip_cost: 5, screen_time_minutes: 15 },
  { name: 'Screen Time - 30 min', emoji: '📱', chip_cost: 5, screen_time_minutes: 30 },
  { name: 'Screen Time - 1 hour', emoji: '📱', chip_cost: 10, screen_time_minutes: 60 },
];

/** Turns the interview answers into the profile's starter content. Pure and deterministic. */
export function buildSeed(answers: SetupAnswers): SeedPlan {
  const { age_band } = answers;
  const young = age_band === '2-7' || age_band === '8-12';

  const locations = [
    { name: 'Home', emoji: '🏠' },
    ...PLACE_TILES.filter((place) => answers.places.includes(place.key)).map(({ name, emoji }) => ({ name, emoji })),
  ];

  const activities: SeedActivity[] = [
    { name: 'Wake Up', emoji: '🛏️', recurrence: 'daily', recurrence_time: '07:00' },
    { name: 'Breakfast', emoji: '🍳', recurrence: 'daily', recurrence_time: '07:30' },
    { name: 'Lunch', emoji: '🍱', recurrence: 'daily', recurrence_time: '12:00' },
    { name: 'Dinner', emoji: '🍽️', recurrence: 'daily', recurrence_time: '18:00' },
    { name: 'Sleep', emoji: '😴', recurrence: 'daily', recurrence_time: SLEEP_TIME[age_band] },
  ];
  if (answers.week.includes('school')) {
    activities.push(
      { name: 'Go to School', emoji: '🚌', recurrence: 'weekdays', recurrence_time: '08:30' },
      { name: 'Go Home', emoji: '🏠', recurrence: 'weekdays', recurrence_time: '15:00' },
    );
  }
  if (answers.week.includes('work')) {
    activities.push(
      { name: 'Go to Work', emoji: '💼', recurrence: 'weekdays', recurrence_time: '09:00' },
      { name: 'Go Home', emoji: '🏠', recurrence: 'weekdays', recurrence_time: '17:00' },
    );
  }
  if (answers.week.includes('day_program')) {
    activities.push({ name: 'Day Program', emoji: '🏢', recurrence: 'weekdays', recurrence_time: '09:00' });
  }
  if (answers.week.includes('therapy')) {
    activities.push({ name: 'Therapy', emoji: '🧩' });
  }
  // A small no-repeat library so the picker isn't empty of one-off things.
  activities.push({ name: 'Doctor Visit', emoji: '💊' }, { name: 'Dentist', emoji: '🦷' });
  activities.push(
    ...(young
      ? [
          { name: 'Park', emoji: '🌳' },
          { name: 'Play Time', emoji: '⚽' },
          { name: 'Quiet Time', emoji: '🤫' },
        ]
      : [
          { name: 'Walk', emoji: '🚶' },
          { name: 'Gym', emoji: '🏋️' },
          { name: 'Free Time', emoji: '🎈' },
        ]),
  );

  for (const key of answers.routines) {
    const pack = ROUTINE_PACKS[key];
    activities.push({
      name: pack.name,
      emoji: pack.emoji,
      recurrence: pack.recurrence,
      recurrence_time: key === 'bedtime' ? BEDTIME_TIME[age_band] : pack.recurrence_time,
      steps: young ? pack.young : pack.older,
    });
  }

  const rewards: SeedReward[] = [];
  for (const love of answers.loves) {
    if (love.name === 'Screen time') rewards.push(...SCREEN_TIME_REWARDS);
    else rewards.push({ name: love.name, emoji: love.emoji, chip_cost: 5 });
  }
  // The free-time choice board needs at least one always-available choice.
  rewards.push({ name: 'Free Choice', emoji: '✨', chip_cost: 1, always_available: true });

  return { locations, activities, rewards };
}
