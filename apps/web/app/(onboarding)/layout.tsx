import type { Metadata } from 'next';
import { RequireSession } from '@/lib/auth/RequireSession';
import { withBase } from '@/lib/api/base';
import styles from './layout.module.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <div className={styles.page}>
        <header className={styles.header}>
          <img src={withBase('/brand/mark.svg')} alt="" width={24} height={24} className={styles.mark} />
          <span className={styles.wordmark}>chipperly</span>
        </header>
        <div className={styles.cardWrap}>
          <div className={styles.card}>{children}</div>
        </div>
      </div>
    </RequireSession>
  );
}
