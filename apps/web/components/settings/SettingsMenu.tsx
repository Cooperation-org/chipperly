'use client';

import { useRouter } from 'next/navigation';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Segmented } from '@/components/ui/Segmented';
import { Confirm, useSheet } from '@/components/ui/Sheet';
import { db } from '@/lib/db/db';
import { useSession } from '@/lib/auth/session';
import { GUEST_MESSAGE } from '@/lib/auth/guest';
import { useActiveProfile } from '@/lib/profile/active';
import { useDeviceSettings, setDeviceSettings } from '@/lib/device/settings';
import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/Switch';
import { usesApp, useDeviceRole } from '@/lib/device/role';
import { DeviceRolePicker } from '@/components/onboarding/DeviceRolePicker';
import { LockSheet } from './LockSheet';
import { isSelfManaged, settingsCopy } from './settingsCopy';
import { ShareSheet } from './ShareSheet';
import { SyncSheet } from '@/components/shell/SyncSheet';
import styles from './SettingsMenu.module.css';

function ProfileSwitchSheet({
  profiles,
  activeId,
  onPick,
}: {
  profiles: Profile[];
  activeId: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <ul className={styles.profileList}>
      {profiles.map((p) => {
        const current = p.id === activeId;
        return (
          <li key={p.id}>
            <button type="button" className={styles.profileRow} onClick={() => onPick(p.id)} aria-current={current || undefined}>
              <Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />
              {p.name}
              {current ? <Icon name="check" size={20} className={styles.check} title="Current profile" /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** S20: the settings menu. */
export function SettingsMenu() {
  const router = useRouter();
  const { open, close } = useSheet();
  const { user, accounts, guest } = useSession();
  const { profile, profiles, setActiveProfileId } = useActiveProfile();
  const deviceRole = useDeviceRole();
  const deviceSettings = useDeviceSettings();

  const role = accounts.find((a) => a.account.id === profile?.account_id)?.role;
  const isAdmin = role === 'admin';
  const viewTitle = settingsCopy(isSelfManaged(accounts.find((a) => a.account.id === profile?.account_id)?.account), profile?.name ?? '').viewTitle;

  // Also drops the service worker and its caches: without that, a "cleared"
  // device kept serving the old cached build.
  async function clearLocalData(): Promise<void> {
    close();
    await db.delete();
    if ('serviceWorker' in navigator) {
      for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    }
    if ('caches' in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
    window.location.reload();
  }

  return (
    <div className={styles.page}>
      {profile ? (
        <div className={styles.profileHeader}>
          <Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="list" />
          <span className={styles.profileName}>{profile.name}</span>
        </div>
      ) : null}

      {profile ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>{profile.name}</span>
          <div className={styles.card}>
            <ListRow
              tile={<Picture emoji={profile.avatar_emoji} photo_id={profile.avatar_photo_id} name={profile.name} size="list" />}
              name="Edit profile"
              trailing={<Icon name="chevron" size={20} />}
              onTap={() => router.push(`/settings/profile/edit/?id=${profile.id}`)}
            />
            {usesApp(profile) && !guest ? (
              <>
                <ListRow
                  tile={<Icon name="gear" size={20} />}
                  name={viewTitle}
                  trailing={<Icon name="chevron" size={20} />}
                  onTap={() => open(<LockSheet profileId={profile.id} />, { title: viewTitle })}
                />
                <ListRow
                  tile={<Icon name="lock" size={20} />}
                  name="App blocking"
                  trailing={<Icon name="chevron" size={20} />}
                  onTap={() => router.push('/settings/app-blocking/')}
                />
              </>
            ) : null}
            <ListRow
              tile={<Icon name="star" size={20} />}
              name="Feelings"
              trailing={<Icon name="chevron" size={20} />}
              onTap={() => router.push('/settings/attitude/')}
            />
            <ListRow
              tile={<span aria-hidden="true">😊</span>}
              name="Chipper Chart"
              trailing={<Icon name="chevron" size={20} />}
              onTap={() => router.push('/chipper-chart/')}
            />
            {Object.keys(profile.settings.image_credits ?? {}).length === 0 ? null : (
              <ListRow
                tile={<Icon name="image" size={20} />}
                name="Image credits"
                secondary="Where found pictures came from"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => router.push('/settings/credits/')}
              />
            )}
            {guest ? null : (
              <ListRow
                tile={<Icon name="share" size={20} />}
                name="Share link"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => open(<ShareSheet profileId={profile.id} />, { title: 'Share link' })}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Help</span>
        <div className={styles.card}>
          <ListRow
            tile={<Icon name="book" size={20} />}
            name="How to use Chipperly"
            trailing={<Icon name="chevron" size={20} />}
            onTap={() => router.push('/settings/guide/')}
          />
          <ListRow
            tile={<Icon name="edit" size={20} />}
            name="Send feedback"
            secondary="Tell us what is working and what is not"
            trailing={<Icon name="chevron" size={20} />}
            onTap={() => router.push('/settings/feedback/')}
          />
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Library</span>
        <div className={styles.card}>
          <ListRow tile={<Icon name="star" size={20} />} name="Activities" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/library/activities/')} />
          <ListRow tile={<Icon name="split" size={20} />} name="Routines" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/library/routines/')} />
          <ListRow tile={<Icon name="chips" size={20} />} name="Rewards" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/library/rewards/')} />
          <ListRow tile={<Icon name="home" size={20} />} name="Locations" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/library/locations/')} />
        </div>
      </div>

      {isAdmin && !guest ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Team</span>
          <div className={styles.card}>
            <ListRow tile={<Icon name="users" size={20} />} name="Team" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/team/')} />
          </div>
        </div>
      ) : null}

      <div className={styles.section}>
        <span className={styles.sectionTitle}>Profiles</span>
        <div className={styles.card}>
          <ListRow
            tile={<Icon name="users" size={20} />}
            name="Switch profile"
            trailing={<Icon name="chevron" size={20} />}
            onTap={() =>
              open(
                <ProfileSwitchSheet
                  profiles={profiles}
                  activeId={profile?.id}
                  onPick={(id) => {
                    setActiveProfileId(id);
                    close();
                    const picked = profiles.find((p) => p.id === id);
                    if (picked) toast(`Switched to ${picked.name}`);
                  }}
                />,
                { title: 'Switch profile' },
              )
            }
          />
          {guest ? null : (
            <ListRow tile={<Icon name="plus" size={20} />} name="Add profile" trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/profiles/')} />
          )}
        </div>
      </div>

      {guest ? (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Account</span>
          <div className={styles.card}>
            <ListRow tile={<Icon name="users" size={20} />} name="Team, community, plan and devices" secondary={GUEST_MESSAGE} />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>Community</span>
            <div className={styles.card}>
              <ListRow
                tile={<Icon name="users" size={20} />}
                name="Browse the community"
                secondary="Stories and routines other families share"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => router.push('/community/')}
              />
              <ListRow
                tile={<Icon name="users" size={20} />}
                name="Your community name"
                secondary="Chosen once, and public"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => router.push('/settings/community/')}
              />
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionTitle}>Account</span>
            <div className={styles.card}>
              <ListRow tile={<Icon name="gear" size={20} />} name="Account" secondary={user?.email} trailing={<Icon name="chevron" size={20} />} onTap={() => router.push('/settings/account/')} />
              <ListRow
                tile={<Icon name="chips" size={20} />}
                name="Plan"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => router.push('/settings/billing/')}
              />
              {user?.is_super_admin ? (
                <ListRow
                  tile={<Icon name="gear" size={20} />}
                  name="Admin dashboard"
                  secondary="Sign-ups, trials, early access codes"
                  trailing={<Icon name="chevron" size={20} />}
                  onTap={() => router.push('/settings/admin/')}
                />
              ) : null}
              {user?.is_super_admin ? (
                <ListRow
                  tile={<Icon name="clipboard" size={20} />}
                  name="Feedback inbox"
                  secondary="What beta testers have sent"
                  trailing={<Icon name="chevron" size={20} />}
                  onTap={() => router.push('/settings/admin/feedback/')}
                />
              ) : null}
              {user?.is_super_admin ? (
                <ListRow
                  tile={<Icon name="sync" size={20} />}
                  name="Backups"
                  secondary="See a day's backup and restore from it"
                  trailing={<Icon name="chevron" size={20} />}
                  onTap={() => router.push('/settings/admin/backups/')}
                />
              ) : null}
              <ListRow
                tile={<span aria-hidden="true">📱</span>}
                name="Devices"
                secondary="See and name every device that's signed in"
                trailing={<Icon name="chevron" size={20} />}
                onTap={() => router.push('/settings/devices/')}
              />
            </div>
          </div>
        </>
      )}

      <div className={styles.section}>
        <span className={styles.sectionTitle}>This device</span>
        <div className={styles.card}>
          {guest ? null : (
            <ListRow
              tile={<span aria-hidden="true">📱</span>}
              name="Who uses this device"
              secondary={
                deviceRole?.kind === 'caregiver'
                  ? 'Me, a team member'
                  : deviceRole?.kind === 'child'
                    ? `${profiles.find((p) => p.id === deviceRole.profile_id)?.name ?? 'Someone'}'s device`
                    : 'Not chosen yet (locked view first)'
              }
              trailing={<Icon name="chevron" size={20} />}
              onTap={() =>
                open(
                  <DeviceRolePicker
                    onDone={(role) => {
                      close();
                      if (role.kind === 'child') router.push('/child/');
                    }}
                  />,
                  { title: 'Who uses this device?' },
                )
              }
            />
          )}
          {guest ? null : (
            <ListRow tile={<Icon name="sync" size={20} />} name="Sync status" trailing={<Icon name="chevron" size={20} />} onTap={() => open(<SyncSheet />, { title: 'Sync' })} />
          )}
          <div className={styles.controlRow}>
            <span className={styles.controlLabel}>Sounds</span>
            <Switch label="Sounds" checked={deviceSettings.sounds} onChange={(v) => void setDeviceSettings({ sounds: v })} />
          </div>
          <div className={styles.controlRow}>
            <span className={styles.controlLabel}>Reduce motion</span>
            <Segmented
              label="Reduce motion"
              value={deviceSettings.reduce_motion}
              onChange={(v) => void setDeviceSettings({ reduce_motion: v as 'system' | 'on' | 'off' })}
              items={[
                { value: 'system', label: 'System' },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </div>
          <ListRow
            tile={<Icon name="trash" size={20} />}
            name="Clear local data"
            trailing={<Icon name="chevron" size={20} />}
            onTap={() =>
              open(
                <Confirm
                  title="Clear local data"
                  body={
                    guest
                      ? 'Everything in this trial and the cached app will be erased from this device.'
                      : "This device's saved data and the cached app will be cleared, then reloaded from the server. You'll need to sign in again."
                  }
                  confirmLabel="Clear local data"
                  danger
                  onConfirm={() => void clearLocalData()}
                  onCancel={close}
                />,
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
