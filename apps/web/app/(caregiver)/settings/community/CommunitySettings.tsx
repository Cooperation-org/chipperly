'use client';

import { NicknameSetup } from '@/components/community/NicknameSetup';
import { ReportQueue } from '@/components/community/moderation/ReportQueue';
import { useSession } from '@/lib/auth/session';
import { canModerate } from '@/lib/data/moderation';
import styles from './CommunitySettings.module.css';

/** Nickname for everyone; the report queue only for moderators. */
export function CommunitySettings() {
  const { user } = useSession();
  return (
    <div className={styles.page}>
      <NicknameSetup />
      {canModerate(user) ? (
        <>
          <h2 className={styles.heading}>Reports</h2>
          <ReportQueue />
        </>
      ) : null}
    </div>
  );
}
