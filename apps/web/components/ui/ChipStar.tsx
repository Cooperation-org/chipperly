import styles from './ChipStar.module.css';

export type ChipStarTone = 'positive' | 'neutral' | 'negative';

export interface ChipStarProps {
  /** CSS size of the square star box, e.g. 40 or '100%'. */
  size?: number | string;
  /** Grey outline version for an unearned chip. */
  muted?: boolean;
  /** Colours the centre disc; the rays keep the brand colours. Default is the brand teal. */
  tone?: ChipStarTone | null;
  className?: string;
}

// The owner's symmetric star (brand/logo, "logo_fill_only_symmetric for
// checks.svg"): twelve rays around a disc. This is the chip and the check
// mark everywhere, so a child sees the same star on the board, in the top
// bar and on a done task.
const RAYS: ReadonlyArray<readonly [string, string]> = [
  ['#df5a20', 'M408.242 382.556 500 0l91.758 382.556z'],
  ['#f89c10', 'M479.258 352.412 750 66.988 638.186 444.169z'],
  ['#df5a20', 'M555.831 361.814 933.013 250 647.588 520.742z'],
  ['#b5d222', 'M617.444 408.242 1000 500l-382.556 91.758z'],
  ['#fddf1e', 'M647.588 479.258 933.013 750 555.831 638.186z'],
  ['#f89c10', 'M638.186 555.831 750 933.013 479.258 647.588z'],
  ['#df5a20', 'M591.758 617.444 500 1000l-91.758-382.556z'],
  ['#f89c10', 'M520.742 647.588 250 933.013l111.814-377.182z'],
  ['#fddf1e', 'M444.169 638.186 66.988 750l285.424-270.742z'],
  ['#b5d222', 'M382.556 591.758 0 500l382.556-91.758z'],
  ['#24a6e1', 'M352.412 520.742 66.988 250l377.181 111.814z'],
  ['#815e98', 'M361.814 444.169 250 66.988l270.742 285.424z'],
];

/** Decorative by default; the parent carries the label. */
export function ChipStar({ size = 40, muted = false, tone = null, className }: ChipStarProps) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      className={[styles.star, muted ? styles.muted : '', tone ? styles[tone] : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      {RAYS.map(([fill, d]) => (
        <path key={d} d={d} fill={muted ? undefined : fill} className={styles.ray} />
      ))}
      <circle cx="500" cy="500" r="200" className={styles.disc} />
    </svg>
  );
}
