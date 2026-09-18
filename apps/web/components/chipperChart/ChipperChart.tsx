'use client';

import { useRouter } from 'next/navigation';
import { formatDayLabel, todayIso } from '@chipperly/shared/helpers/date';
import { useActiveProfile } from '@/lib/profile/active';
import { useSession } from '@/lib/auth/session';
import { levelEmoji, useMoodHistory, useMoodLevel } from '@/lib/data/mood';
import { useDeviceSettings, setDeviceSettings } from '@/lib/device/settings';
import { playChipperDown, playChipperUp } from '@/lib/sound';
import { IconButton } from '@/components/ui/IconButton';
import { MoodMeter } from './MoodMeter';
import { setMoodWithSound } from './moodSound';
import styles from './ChipperChart.module.css';

const BLURB =
  "Approach your day with a chipperly attitude! Give yourself a plus when you did things with a positive mindset. Give yourself a minus for having a bad attitude.";

function formatLevel(level: number): string {
  return level > 0 ? `+${level}` : `${level}`;
}

const HISTORY_DAYS = 7;

/** S35: the Chipper Chart caregiver page, a running per-day mood meter (beta parity). */
export function ChipperChart() {
  const router = useRouter();
  const { profile } = useActiveProfile();
  const { user } = useSession();
  const deviceSettings = useDeviceSettings();

  const profileId = profile?.id ?? '';
  const userId = user?.id ?? '';
  const isoDate = todayIso();

  const level = useMoodLevel(profileId, isoDate);
  const history = useMoodHistory(profileId).slice(0, HISTORY_DAYS);

  if (!profile) return null;

  function handleChange(next: number): void {
    void setMoodWithSound(profileId, isoDate, level, next, userId, { playChipperUp, playChipperDown });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <IconButton icon="arrowLeft" aria-label="Back" onClick={() => router.push('/today/')} />
        <h1 className={styles.title}>
          Chipper Chart <span aria-hidden="true">😊</span>
        </h1>
      </div>

      <div className={styles.card}>
        <div className={styles.topRow}>
          <select className={styles.themeSelect} aria-label="Theme" value="basic" onChange={() => {}}>
            <option value="basic">Basic</option>
          </select>
          <button
            type="button"
            className={styles.mute}
            aria-label={deviceSettings.sounds ? 'Mute sounds' : 'Unmute sounds'}
            onClick={() => void setDeviceSettings({ sounds: !deviceSettings.sounds })}
          >
            <span aria-hidden="true">{deviceSettings.sounds ? '🔊' : '🔇'}</span>
          </button>
        </div>

        <MoodMeter level={level} onChange={handleChange} />

        <span className={styles.bigEmoji} aria-hidden="true">
          {levelEmoji(level)}
        </span>

        <p className={styles.blurb}>{BLURB}</p>
      </div>

      <p className={styles.today}>Today: {formatLevel(level)}</p>

      {history.length === 0 ? (
        <p className={styles.emptyHistory}>No days recorded yet.</p>
      ) : (
        <ul className={styles.history}>
          {history.map((day) => (
            <li key={day.date} className={styles.historyRow}>
              <span className={styles.historyDate}>{formatDayLabel(day.date)}</span>
              <span aria-hidden="true">{day.emoji}</span>
              <span className={styles.historyLevel}>{formatLevel(day.level)}</span>
              <span className={styles.historyCounts} aria-label={`${day.plus} plus, ${day.minus} minus`}>
                +{day.plus} {'−'}
                {day.minus}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
