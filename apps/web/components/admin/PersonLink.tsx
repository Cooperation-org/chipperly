import type { ReactNode } from 'react';
import Link from 'next/link';

/** A name anywhere in the admin that opens People searched for it (a name, an email or a family). */
export function PersonLink({ q, children }: { q: string | null | undefined; children: ReactNode }) {
  if (!q) return <>{children}</>;
  return <Link href={`/admin/people/?q=${encodeURIComponent(q)}`}>{children}</Link>;
}
