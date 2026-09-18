'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/Button';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { db } from '@/lib/db/db';
import { withBase } from '@/lib/api/base';
import { upsert } from '@/lib/sync/mutate';
import { useSession } from '@/lib/auth/session';
import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/Switch';
import styles from './ShareSheet.module.css';

export interface ShareSheetProps {
  profileId: string;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let token = '';
  for (const byte of bytes) token += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  return token;
}

function shareLink(token: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? '';
  return `${origin}${withBase(`/share/?token=${token}`)}`;
}

/** S28: read-only share link toggle, admin only. */
export function ShareSheet({ profileId }: ShareSheetProps) {
  const { open, back } = useSheet();
  const { accounts } = useSession();
  const row = useLiveQuery(() => db.profiles.get(profileId), [profileId]);
  const isAdmin = accounts.find((a) => a.account.id === row?.account_id)?.role === 'admin';

  if (!row) return null;

  if (!isAdmin) {
    return (
      <div className={styles.sheet}>
        <p className={styles.memberNote}>Only an account admin can share this profile&apos;s link.</p>
      </div>
    );
  }

  const profileRow = row;
  const shareToken = row.share_token;

  async function setToken(token: string | null): Promise<void> {
    await upsert('profiles', { ...profileRow, share_token: token });
  }

  const on = Boolean(shareToken);

  return (
    <div className={styles.sheet}>
      <div className={styles.row}>
        <span className={styles.label}>Share a read-only link</span>
        <Switch
          label="Share a read-only link"
          checked={on}
          onChange={(next) => void setToken(next ? newShareToken() : null)}
        />
      </div>
      {shareToken ? (
        <>
          <div className={styles.linkRow}>
            <input className={styles.linkField} readOnly value={shareLink(shareToken)} onFocus={(e) => e.target.select()} aria-label="Share link" />
          </div>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(shareLink(shareToken));
                toast('Copied');
              }}
            >
              Copy
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                open(
                  <Confirm
                    title="Regenerate link"
                    body="The old link will stop working."
                    confirmLabel="Regenerate link"
                    danger
                    onConfirm={() => {
                      void setToken(newShareToken());
                      back();
                    }}
                    onCancel={back}
                  />,
                )
              }
            >
              Regenerate
            </Button>
          </div>
        </>
      ) : null}
      <p className={styles.hint}>Anyone with this link can see today&apos;s list and chip count. Nothing else.</p>
    </div>
  );
}
