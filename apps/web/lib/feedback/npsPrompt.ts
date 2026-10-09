const DAY = 86_400_000;
export const NPS_MILESTONES = [7, 21] as const;

/** Which "would you recommend us?" prompt is due, if any. `handled` = milestones already shown or answered. The latest due one wins. */
export function dueNpsMilestone(createdAt: number, now: number, handled: readonly number[]): number | null {
  const age = (now - createdAt) / DAY;
  const due = NPS_MILESTONES.filter((m) => age >= m && !handled.includes(m));
  return due.length > 0 ? due[due.length - 1]! : null;
}

/** Showing the 21 day prompt also settles the 7 day one: nobody gets asked twice in a row. */
export const handledAfter = (milestone: number, handled: readonly number[]): number[] => [...new Set([...handled, ...NPS_MILESTONES.filter((m) => m <= milestone)])];
