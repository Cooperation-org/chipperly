import styles from './Avatar.module.css';

/** A person's emoji avatar, or their first letter when they have not picked one. Decorative: the nickname always sits beside it. */
export function Avatar({ nickname, emoji, size = 'sm' }: { nickname: string; emoji: string | null; size?: 'sm' | 'lg' }) {
  return (
    <span className={size === 'lg' ? `${styles.avatar} ${styles.lg}` : styles.avatar} aria-hidden="true">
      {emoji ?? nickname.charAt(0).toUpperCase()}
    </span>
  );
}
