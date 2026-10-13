'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NicknameSetup } from '@/components/community/NicknameSetup';
import { ProfileEditor } from '@/components/community/ProfileEditor';
import { ADMIN_URL, isLocalHost } from '@/lib/admin/host';
import { useSession } from '@/lib/auth/session';
import { canModerate } from '@/lib/data/moderation';
import styles from './CommunitySettings.module.css';

/** Nickname, then avatar and bio, for everyone; moderators get a link to the report queue on the admin site. */
export function CommunitySettings() {
  const { user } = useSession();
  const router = useRouter();
  // Bumped when a nickname is first saved, so the profile editor loads then.
  const [nicknameVersion, setNicknameVersion] = useState(0);
  return (
    <div className={styles.page}>
      <NicknameSetup onSaved={() => setNicknameVersion((n) => n + 1)} />
      <ProfileEditor key={nicknameVersion} />
      {canModerate(user) ? (
        <>
          <h2 className={styles.heading}>Reports</h2>
          <p>
            Reports are handled on the admin site.{' '}
            {/* The admin site is another address; a local server serves it in place (decided on click, so the HTML matches the server's). */}
            <a
              href={`${ADMIN_URL}/admin/moderation/`}
              onClick={(e) => {
                if (!isLocalHost()) return;
                e.preventDefault();
                router.push('/admin/moderation/');
              }}
            >
              Open the report queue
            </a>
          </p>
        </>
      ) : null}
    </div>
  );
}
