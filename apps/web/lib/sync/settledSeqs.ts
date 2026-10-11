/** Outbox seqs a push settled: the ones it sent for this row, not one written while it was in flight. */
export function settledSeqs(entries: readonly { seq?: number }[], pushedSeq: number | undefined): number[] {
  if (pushedSeq === undefined) return [];
  return entries.flatMap((e) => (e.seq !== undefined && e.seq <= pushedSeq ? [e.seq] : []));
}
