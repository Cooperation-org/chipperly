export type ChipSize = 'small' | 'medium' | 'large' | 'xl';

/** Absent setting: large, the size the child view used before chip size was a setting. */
export const DEFAULT_CHIP_SIZE: ChipSize = 'large';

// Whole pixels keep the star's edges crisp. Large is the old child-view strip (28px) and the old board (44px).
const PX: Record<'strip' | 'board', Record<ChipSize, number>> = {
  strip: { small: 18, medium: 22, large: 28, xl: 40 },
  board: { small: 32, medium: 38, large: 44, xl: 56 },
};

// Width the chips get on a 320px phone: the board has the screen less its gutters, the strip leaves room for the count.
const ROOM = { strip: 240, board: 288 };

export interface ChipLayout {
  px: number;
  gap: number;
  cols: number;
}

/**
 * Star size, gap and columns for a row of `total` chips. Rows come out even
 * (5 chips that don't fit go 3 and 2, never 4 and 1) and fit a 320px screen.
 * Extra large always takes two rows from 4 chips up.
 */
export function chipLayout(size: ChipSize | undefined, total: number, where: 'strip' | 'board'): ChipLayout {
  const s = size ?? DEFAULT_CHIP_SIZE;
  const px = PX[where][s];
  const gap = Math.round(px / 4);
  const perRow = Math.max(1, Math.floor((ROOM[where] + gap) / (px + gap)));
  let rows = Math.max(1, Math.ceil(total / perRow));
  if (s === 'xl' && total >= 4) rows = Math.max(rows, 2);
  return { px, gap, cols: Math.max(1, Math.ceil(total / rows)) };
}
