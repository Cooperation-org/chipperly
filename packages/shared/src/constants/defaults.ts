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
  { name: 'Screen Time - 15 min', emoji: '📱' },
  { name: 'Screen Time - 30 min', emoji: '📱' },
  { name: 'Screen Time - 1 hour', emoji: '📱' },
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
