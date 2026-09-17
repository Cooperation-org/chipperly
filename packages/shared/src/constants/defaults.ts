/**
 * Copied verbatim (name, emoji) from
 * reference-lovable/app/models/profile.rb `DEFAULT_ACTIVITIES` /
 * `DEFAULT_REWARDS`. Seeded for every new profile.
 */

export interface DefaultItem {
  readonly name: string;
  readonly emoji: string;
}

export const DEFAULT_ACTIVITIES: readonly DefaultItem[] = [
  { name: 'Wake Up', emoji: '🛏️' },
  { name: 'Breakfast', emoji: '🍳' },
  { name: 'Get Dressed', emoji: '👕' },
  { name: 'Brush Teeth', emoji: '🪥' },
  { name: 'Go to School', emoji: '🚌' },
  { name: 'School Time', emoji: '🏫' },
  { name: 'Snack Time', emoji: '🍎' },
  { name: 'Lunch', emoji: '🍱' },
  { name: 'Recess/Play', emoji: '⚽' },
  { name: 'Go Home', emoji: '🏠' },
  { name: 'Homework', emoji: '📝' },
  { name: 'iPad Time', emoji: '📱' },
  { name: 'Dinner', emoji: '🍽️' },
  { name: 'Bath Time', emoji: '🛁' },
  { name: 'Bedtime Story', emoji: '📖' },
  { name: 'Sleep', emoji: '😴' },
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
