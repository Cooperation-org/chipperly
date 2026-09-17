'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import styles from './TabRail.module.css';

export interface TabItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface TabRailProps {
  items: TabItem[];
}

/** Fixed left rail, 88px wide, visible only at 1024px and up (see TabBar below that). */
export function TabRail({ items }: TabRailProps) {
  const pathname = usePathname();
  return (
    <nav className={styles.rail} data-shell-nav aria-label="Primary">
      {items.map((item) => {
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[styles.item, current ? styles.current : ''].filter(Boolean).join(' ')}
            aria-current={current ? 'page' : undefined}
          >
            <span className={styles.pill}>
              <Icon name={item.icon} size={22} />
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
