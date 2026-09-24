/**
 * Copied verbatim (name, emoji) from
 * reference-lovable/app/models/profile.rb `DEFAULT_ACTIVITIES` /
 * `DEFAULT_REWARDS`. Seeded for every new profile.
 */

export interface DefaultItem {
  readonly name: string;
  readonly emoji: string;
  /** Starter day plan: seeded activities with a repeat fill a new profile's Today (owner: "less to set up"). */
  readonly recurrence?: 'daily' | 'weekdays' | 'weekends';
  /** HH:MM, optional; orders the starter plan and picks its part of day. */
  readonly recurrence_time?: string;
  /** Rewards only: minutes of screen time it buys; the caregiver still picks which apps. */
  readonly screen_time_minutes?: number;
}

export const DEFAULT_ACTIVITIES: readonly DefaultItem[] = [
  { name: 'Wake Up', emoji: '🛏️', recurrence: 'daily', recurrence_time: '07:00' },
  { name: 'Breakfast', emoji: '🍳', recurrence: 'daily', recurrence_time: '07:30' },
  { name: 'Get Dressed', emoji: '👕', recurrence: 'daily', recurrence_time: '08:00' },
  { name: 'Brush Teeth', emoji: '🪥', recurrence: 'daily', recurrence_time: '08:15' },
  { name: 'Go to School', emoji: '🚌', recurrence: 'weekdays', recurrence_time: '08:30' },
  { name: 'School Time', emoji: '🏫' },
  { name: 'Snack Time', emoji: '🍎' },
  { name: 'Lunch', emoji: '🍱', recurrence: 'daily', recurrence_time: '12:00' },
  { name: 'Recess/Play', emoji: '⚽' },
  { name: 'Go Home', emoji: '🏠', recurrence: 'weekdays', recurrence_time: '15:00' },
  { name: 'Homework', emoji: '📝', recurrence: 'weekdays', recurrence_time: '16:00' },
  { name: 'iPad Time', emoji: '📱' },
  { name: 'Dinner', emoji: '🍽️', recurrence: 'daily', recurrence_time: '18:00' },
  { name: 'Bath Time', emoji: '🛁', recurrence: 'daily', recurrence_time: '19:00' },
  { name: 'Bedtime Story', emoji: '📖', recurrence: 'daily', recurrence_time: '19:30' },
  { name: 'Sleep', emoji: '😴', recurrence: 'daily', recurrence_time: '20:00' },
  { name: 'Doctor Visit', emoji: '💊' },
  { name: 'Dentist', emoji: '🦷' },
  { name: 'Therapy', emoji: '🧩' },
  { name: 'Speech Therapy', emoji: '🗣️' },
  { name: 'Occupational Therapy', emoji: '👋' },
  { name: 'Library', emoji: '📚' },
  { name: 'Park', emoji: '🌳' },
  { name: 'Swimming', emoji: '🏊' },
  { name: 'Birthday Party', emoji: '🎂' },
  { name: 'Movie Time', emoji: '🎬' },
  { name: 'Music Class', emoji: '🎵' },
  { name: 'Art Class', emoji: '🎨' },
  { name: 'Gym Class', emoji: '🏋️' },
  { name: 'Computer Time', emoji: '💻' },
];

export const DEFAULT_REWARDS: readonly DefaultItem[] = [
  { name: 'Ice cream', emoji: '🍦' },
  { name: 'Screen Time - 15 min', emoji: '📱', screen_time_minutes: 15 },
  { name: 'Screen Time - 30 min', emoji: '📱', screen_time_minutes: 30 },
  { name: 'Screen Time - 1 hour', emoji: '📱', screen_time_minutes: 60 },
  { name: 'Park Visit', emoji: '🌳' },
  { name: 'Movie Time', emoji: '🎬' },
  { name: 'Toy', emoji: '🧸' },
  { name: 'Candy', emoji: '🍬' },
  { name: 'Video Games', emoji: '🎮' },
  { name: 'Extra Playtime', emoji: '⚽' },
  { name: 'Swordfighting', emoji: '⚔️' },
  { name: 'Hide and Seek', emoji: '👀' },
  { name: 'Bike Ride', emoji: '🚴' },
  { name: 'Tacos', emoji: '🌮' },
  { name: 'Nachos', emoji: '🧀' },
  { name: 'Pool Time', emoji: '🏊' },
  { name: 'Library Visit', emoji: '📚' },
  { name: 'Free Choice', emoji: '✨' },
];

export const DEFAULT_LOCATIONS: readonly DefaultItem[] = [
  { name: 'Home', emoji: '🏠' },
  { name: 'School', emoji: '🏫' },
];

/** The owner's morning routine (beta screenshot, 24 Sept 2026); seeded onto existing profiles by `pnpm -F @chipperly/api seed:morning-routine`. */
export const MORNING_ROUTINE = {
  name: 'My Morning Routine',
  emoji: '🔁',
  recurrence: 'daily',
  recurrence_time: '06:00',
  steps: [
    { name: 'Wake Up', emoji: '⏰' },
    { name: 'Bathroom', emoji: '🚽' },
    { name: 'Brush Teeth', emoji: '🪥' },
    { name: 'Brush Hair', emoji: '🪮' },
    { name: 'Take Medication', emoji: '💊' },
    { name: 'Get Dressed', emoji: '👕' },
    { name: 'Breakfast', emoji: '🍳' },
    { name: 'Dishes', emoji: '🍽️' },
    { name: 'Learning', emoji: '📝' },
    { name: 'Put Shoes', emoji: '👟' },
    { name: 'Go to School', emoji: '🚌' },
  ],
} as const;
