'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_URL, isAdminHost, isLocalHost } from '@/lib/admin/host';
import { setAdminPass } from '@/lib/admin/pass';
import type { AdminRole } from '@chipperly/shared/schemas/admin';
import { useAdminRole } from '@/lib/admin/role';
import { signOut, useSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/Button';
import { TwoStepGate } from './TwoStepGate';
import styles from './AdminShell.module.css';

type NavItem = { href: string; label: string; roles?: readonly AdminRole[] };

const STAFF: readonly AdminRole[] = ['super', 'support'];
const EVERYONE: readonly AdminRole[] = ['super', 'support', 'moderator'];

/** The menu, grouped by what someone came to do. */
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: '', items: [{ href: '/admin/', label: 'Today', roles: STAFF }] },
  {
    group: 'People',
    items: [
      { href: '/admin/people/', label: 'People', roles: STAFF },
      { href: '/admin/waitlist/', label: 'Waitlist', roles: STAFF },
      { href: '/admin/orgs/', label: 'Organizations', roles: STAFF },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/admin/growth/', label: 'Growth', roles: STAFF },
      { href: '/admin/subscriptions/', label: 'Subscriptions', roles: STAFF },
      { href: '/admin/payments/', label: 'Payments', roles: STAFF },
      { href: '/admin/failed-payments/', label: 'Failed payments', roles: STAFF },
    ],
  },
  {
    group: 'Support',
    items: [
      { href: '/admin/feedback/', label: 'Feedback', roles: STAFF },
      { href: '/admin/moderation/', label: 'Moderation', roles: EVERYONE },
      { href: '/admin/errors/', label: 'App errors', roles: STAFF },
    ],
  },
  {
    group: 'System',
    items: [
      { href: '/admin/activity/', label: 'Activity', roles: STAFF },
      { href: '/admin/team/', label: 'Admin team', roles: STAFF },
      { href: '/admin/sync/', label: 'Sync health', roles: ['super'] },
      { href: '/admin/backups/', label: 'Backups', roles: ['super'] },
    ],
  },
];

const ROLE_WORDS: Record<AdminRole, string> = { super: 'Super admin', support: 'Support', moderator: 'Moderator' };

const allowed = (item: NavItem, role: AdminRole | null) => role !== null && (item.roles ?? EVERYONE).includes(role);

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

  const here = NAV.flatMap((g) => g.items).find((n) => n.href === path);
  const home = role ? NAV.flatMap((g) => g.items).find((n) => allowed(n, role))?.href : undefined;
  const wrongPage = Boolean(role && here && !allowed(here, role) && home);

  useEffect(() => {
    if (wrongPage && home) router.replace(home);
  }, [wrongPage, home, router]);

  if (elsewhere || status !== 'signed_in' || wrongPage) return null;

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

  return (
    <TwoStepGate email={user?.email ?? ''}>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <span className={styles.brand}>Chipperly admin</span>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </header>
        <div className={styles.body}>
          <nav id="admin-menu" className={styles.nav} data-open={menuOpen || undefined} aria-label="Admin">
            {NAV.map((g) => {
              const items = g.items.filter((n) => allowed(n, role));
              if (items.length === 0) return null;
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
              <span className={styles.muted}>{ROLE_WORDS[role]}</span>
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
