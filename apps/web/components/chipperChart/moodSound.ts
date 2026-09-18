import { setMood } from '@/lib/data/mood';

/** Shared by ChipperChart.tsx and ChipperChartSheet.tsx: persist the tap, then play the matching tone. */
export async function setMoodWithSound(
  profileId: string,
  isoDate: string,
  prevLevel: number,
  nextLevel: number,
  userId: string,
  sounds: { playChipperUp: () => void; playChipperDown: () => void },
): Promise<void> {
  await setMood(profileId, isoDate, nextLevel, userId);
  if (nextLevel > prevLevel) sounds.playChipperUp();
  else if (nextLevel < prevLevel) sounds.playChipperDown();
}
