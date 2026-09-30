'use client';

import { useState } from 'react';
import { NicknameSetup } from '@/components/community/NicknameSetup';
import { ProfileEditor } from '@/components/community/ProfileEditor';
import { ReportQueue } from '@/components/community/moderation/ReportQueue';
import { useSession } from '@/lib/auth/session';
import { canModerate } from '@/lib/data/moderation';
import styles from './CommunitySettings.module.css';

/** Nickname, then avatar and bio, for everyone; the report queue only for moderators. */
export function CommunitySettings() {
  const { user } = useSession();
  // Bumped when a nickname is first saved, so the profile editor loads then.
  const [nicknameVersion, setNicknameVersion] = useState(0);
  return (
    <div className={styles.page}>
      <NicknameSetup onSaved={() => setNicknameVersion((n) => n + 1)} />
      <ProfileEditor key={nicknameVersion} />
      {canModerate(user) ? (
        <>
          <h2 className={styles.heading}>Reports</h2>
          <ReportQueue />
        </>
      ) : null}
    </div>
  );
}
