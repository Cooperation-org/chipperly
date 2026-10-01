/**
 * The built-in template library: ready-made routines any caregiver can add to
 * a profile at any time (Today's Add sheet, Settings > Activities). Adding one
 * makes an ordinary activity with steps, so everything about it can be edited.
 * Speech and ABA reuse the setup packs so the two lists never drift.
 */
import { ROUTINE_PACKS, type SeedStep } from './setup.js';

export const TEMPLATE_CATEGORIES = ['Therapy', 'Daily life', 'Appointments', 'Social'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface RoutineTemplate {
  readonly key: string;
  readonly name: string;
  readonly emoji: string;
  readonly category: TemplateCategory;
  readonly description: string;
  readonly steps: readonly SeedStep[];
  /** Shown above the steps before adding. */
  readonly note?: string;
}

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    key: 'speech',
    name: 'Speech therapy session',
    emoji: ROUTINE_PACKS.speech.emoji,
    category: 'Therapy',
    description: 'Warm up, practice sounds and words, then a game.',
    steps: ROUTINE_PACKS.speech.young,
  },
  {
    key: 'aba',
    name: 'ABA session',
    emoji: ROUTINE_PACKS.aba.emoji,
    category: 'Therapy',
    description: 'A common session arc from hello to a reward.',
    steps: ROUTINE_PACKS.aba.young,
    note: 'Clinics differ. A therapist should adjust these steps to match your sessions.',
  },
  {
    key: 'ot',
    name: 'Occupational therapy session',
    emoji: '🖐️',
    category: 'Therapy',
    description: 'Warm up, move, work with hands, then clean up.',
    steps: [
      { name: 'Say Hello', emoji: '👋' },
      { name: 'Warm Up Moves', emoji: '🤸' },
      { name: 'Hands-On Activity', emoji: '✂️' },
      { name: 'Calm Down Break', emoji: '🧘' },
      { name: 'Tidy Up', emoji: '🧹' },
      { name: 'All Done', emoji: '🎉' },
    ],
  },
  {
    key: 'doctor',
    name: 'Doctor visit',
    emoji: '🩺',
    category: 'Appointments',
    description: 'What happens at the doctor, one step at a time.',
    steps: [
      { name: 'Go to the Doctor', emoji: '🚗' },
      { name: 'Wait My Turn', emoji: '🪑' },
      { name: 'Say Hello', emoji: '👋' },
      { name: 'Check-Up', emoji: '🩺' },
      { name: 'Pick a Sticker', emoji: '⭐' },
      { name: 'Go Home', emoji: '🏠' },
    ],
  },
  {
    key: 'dentist',
    name: 'Dentist visit',
    emoji: '🦷',
    category: 'Appointments',
    description: 'Sit back, open wide, and pick a prize.',
    steps: [
      { name: 'Go to the Dentist', emoji: '🚗' },
      { name: 'Wait My Turn', emoji: '🪑' },
      { name: 'Sit in the Chair', emoji: '💺' },
      { name: 'Open Wide', emoji: '😮' },
      { name: 'Rinse and Spit', emoji: '💧' },
      { name: 'Pick a Prize', emoji: '🎁' },
    ],
  },
  {
    key: 'haircut',
    name: 'Haircut',
    emoji: '💇',
    category: 'Appointments',
    description: 'Sit still, snip snip, and all done.',
    steps: [
      { name: 'Go to the Barber', emoji: '🚗' },
      { name: 'Wait My Turn', emoji: '🪑' },
      { name: 'Put On the Cape', emoji: '🧣' },
      { name: 'Sit Still', emoji: '🧍' },
      { name: 'Haircut Time', emoji: '✂️' },
      { name: 'All Done', emoji: '🎉' },
    ],
  },
  {
    key: 'trip',
    name: 'Getting ready for a trip',
    emoji: '🧳',
    category: 'Daily life',
    description: 'Pack, check the list, and get in the car.',
    steps: [
      { name: 'Pack My Bag', emoji: '🎒' },
      { name: 'Pick a Toy', emoji: '🧸' },
      { name: 'Bring a Snack', emoji: '🍎' },
      { name: 'Bathroom First', emoji: '🚽' },
      { name: 'Shoes and Jacket', emoji: '👟' },
      { name: 'Get in the Car', emoji: '🚗' },
    ],
  },
  {
    key: 'grocery',
    name: 'Grocery store trip',
    emoji: '🛒',
    category: 'Daily life',
    description: 'Walk in, find the list, pay, and head home.',
    steps: [
      { name: 'Get a Cart', emoji: '🛒' },
      { name: 'Find Our List', emoji: '📝' },
      { name: 'Walk and Look', emoji: '🚶' },
      { name: 'Wait in Line', emoji: '🧍' },
      { name: 'Pay', emoji: '💳' },
      { name: 'Carry Bags Home', emoji: '🛍️' },
    ],
  },
  {
    key: 'playdate',
    name: 'Playdate',
    emoji: '🤝',
    category: 'Social',
    description: 'Say hello, take turns, and say goodbye.',
    steps: [
      { name: 'Say Hello', emoji: '👋' },
      { name: 'Show My Toys', emoji: '🧸' },
      { name: 'Take Turns', emoji: '🔄' },
      { name: 'Snack Time', emoji: '🍪' },
      { name: 'Tidy Up Together', emoji: '🧹' },
      { name: 'Say Goodbye', emoji: '🙋' },
    ],
  },
  {
    key: 'birthday',
    name: 'Birthday party',
    emoji: '🎂',
    category: 'Social',
    description: 'Arrive, play, sing, eat cake, and go home.',
    steps: [
      { name: 'Give the Gift', emoji: '🎁' },
      { name: 'Say Hello', emoji: '👋' },
      { name: 'Play Games', emoji: '🎈' },
      { name: 'Sing Happy Birthday', emoji: '🎶' },
      { name: 'Eat Cake', emoji: '🍰' },
      { name: 'Say Thank You', emoji: '🙏' },
      { name: 'Go Home', emoji: '🏠' },
    ],
  },
];
