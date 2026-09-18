'use client';

import { todayIso } from '@chipperly/shared/helpers/date';
import { useMoodLevel } from '@/lib/data/mood';
import { playChipperDown, playChipperUp } from '@/lib/sound';
import { MoodMeter } from './MoodMeter';
import { setMoodWithSound } from './moodSound';
import styles from './ChipperChartSheet.module.css';

export interface ChipperChartSheetProps {
  profileId: string;
  userId: string;
}

/** S32 child mode: the Chipper Chart reduced to bar, face and minus/plus only, opened as a sheet. */
export function ChipperChartSheet({ profileId, userId }: ChipperChartSheetProps) {
  const isoDate = todayIso();
  const level = useMoodLevel(profileId, isoDate);

  function handleChange(next: number): void {
    void setMoodWithSound(profileId, isoDate, level, next, userId, { playChipperUp, playChipperDown });
  }

  return (
    <div className={styles.sheet}>
      <MoodMeter level={level} onChange={handleChange} />
    </div>
  );
}
