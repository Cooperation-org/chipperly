'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_URL, isAdminHost, isLocalHost } from '@/lib/admin/host';
import { setAdminPass } from '@/lib/admin/pass';
import { useAdminRole } from '@/lib/admin/role';
import { signOut, useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { TwoStepGate } from './TwoStepGate';
import styles from './AdminShell.module.css';

type NavItem = { href: string; label: string; superOnly?: boolean };

/** The menu, grouped by what someone came to do. */
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: '', items: [{ href: '/admin/', label: 'Today' }] },
  {
    group: 'People',
    items: [
      { href: '/admin/people/', label: 'People' },
      { href: '/admin/waitlist/', label: 'Waitlist' },
      { href: '/admin/orgs/', label: 'Organizations' },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/admin/growth/', label: 'Growth' },
      { href: '/admin/subscriptions/', label: 'Subscriptions' },
      { href: '/admin/payments/', label: 'Payments' },
      { href: '/admin/failed-payments/', label: 'Failed payments' },
    ],
  },
  {
    group: 'Support',
    items: [
      { href: '/admin/feedback/', label: 'Feedback' },
      { href: '/admin/moderation/', label: 'Moderation' },
      { href: '/admin/errors/', label: 'App errors' },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/admin/activity/', label: 'Activity' },
      { href: '/admin/sync/', label: 'Sync health', superOnly: true },
      { href: '/admin/backups/', label: 'Backups', superOnly: true },
    ],
  },
];

/**
 * The admin site's frame (admin.chipperlyapp.com/admin/): its own sign-in
 * (tokens are per site), a role check, two-step sign-in, and the menu.
 * Opened on the app's address it moves to the admin site; a local server
 * shows it in place.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const role = useAdminRole();
  const router = useRouter();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const elsewhere = !isAdminHost() && !isLocalHost();

  useEffect(() => {
    if (elsewhere) window.location.replace(`${ADMIN_URL}${path}`);
    else if (status === 'signed_out') router.replace('/');
  }, [elsewhere, status, path, router]);

  if (elsewhere || status !== 'signed_in') return null;

  async function leave(): Promise<void> {
    setAdminPass(null);
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

  const current = NAV.flatMap((g) => g.items).find((n) => n.href === path);

  return (
    <TwoStepGate email={user?.email ?? ''}>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <span className={styles.title}>Chipperly admin</span>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close menu' : `Menu${current ? `: ${current.label}` : ''}`}
          </button>
        </header>
        <div className={styles.body}>
          <nav id="admin-menu" className={styles.nav} data-open={menuOpen || undefined} aria-label="Admin">
            {NAV.map((g) => {
              const items = g.items.filter((n) => role === 'super' || !n.superOnly);
              return (
                <div key={g.group || 'home'} className={styles.group}>
                  {g.group ? <span className={styles.groupTitle}>{g.group}</span> : null}
                  {items.map((n) => (
                    <Link key={n.href} href={n.href} className={styles.link} aria-current={path === n.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                      {n.label}
                    </Link>
                  ))}
                </div>
              );
            })}
            <div className={styles.who}>
              <span>{user?.email}</span>
              <span className={styles.muted}>{role === 'super' ? 'Super admin' : 'Support, view only'}</span>
              <Button variant="secondary" onClick={() => void leave()}>
                Sign out
              </Button>
            </div>
          </nav>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </TwoStepGate>
  );
}
