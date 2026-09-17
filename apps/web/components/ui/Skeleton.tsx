import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

/** A placeholder block for the one skeleton screen the app has: first sync of a newly visible profile. */
export function Skeleton({ width = '100%', height = 16, radius = 'sm', className }: SkeletonProps) {
  const radiusVar =
    radius === 'full' ? 'var(--radius-full)' : radius === 'lg' ? 'var(--radius-lg)' : radius === 'md' ? 'var(--radius-md)' : 'var(--radius-sm)';
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radiusVar }}
    />
  );
}
