'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_URL, isAdminHost, isLocalHost } from '@/lib/admin/host';
import { useAdminRole } from '@/lib/admin/role';
import { signOut, useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import styles from './AdminShell.module.css';

const NAV: Array<{ href: string; label: string; superOnly?: boolean }> = [
  { href: '/admin/', label: 'Overview' },
  { href: '/admin/orgs/', label: 'Organizations' },
  { href: '/admin/subscriptions/', label: 'Subscriptions' },
  { href: '/admin/payments/', label: 'Payments' },
  { href: '/admin/feedback/', label: 'Feedback' },
  { href: '/admin/activity/', label: 'Activity' },
  { href: '/admin/sync/', label: 'Sync health', superOnly: true },
  { href: '/admin/backups/', label: 'Backups', superOnly: true },
];

/**
 * The admin site's frame (admin.chipperlyapp.com/admin/): its own sign-in
 * (tokens are per site), a role check, and the navigation. Opened on the
 * app's address it moves to the admin site; a local server shows it in place.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const role = useAdminRole();
  const router = useRouter();
  const path = usePathname();
  const elsewhere = !isAdminHost() && !isLocalHost();

  useEffect(() => {
    if (elsewhere) window.location.replace(`${ADMIN_URL}${path}`);
    else if (status === 'signed_out') router.replace('/');
  }, [elsewhere, status, path, router]);

  if (elsewhere || status !== 'signed_in') return null;

  async function leave(): Promise<void> {
    await signOut();
    router.replace('/');
  }

  if (!role) {
    return (
      <main className={styles.denied}>
        <h1 className={styles.title}>Chipperly admin</h1>
        <p>{user?.email} is not on Chipperly&rsquo;s team list, so there is nothing here for it.</p>
        <Button onClick={() => void leave()}>Sign out</Button>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.title}>Chipperly admin</span>
        <span className={styles.who}>
          {user?.email} · {role === 'super' ? 'Super admin' : 'Support, view only'}
        </span>
        <Button variant="secondary" onClick={() => void leave()}>
          Sign out
        </Button>
      </header>
      <nav className={styles.nav} aria-label="Admin">
        {NAV.filter((n) => role === 'super' || !n.superOnly).map((n) => (
          <Link key={n.href} href={n.href} className={styles.link} aria-current={path === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
