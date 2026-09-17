'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import styles from './TabBar.module.css';

export interface TabItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface TabBarProps {
  items: TabItem[];
}

/** Fixed bottom tab bar, below 1024px (see TabRail for the wide-screen equivalent). */
export function TabBar({ items }: TabBarProps) {
  const pathname = usePathname();
  return (
    <nav className={styles.bar} data-shell-tabbar aria-label="Primary">
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
