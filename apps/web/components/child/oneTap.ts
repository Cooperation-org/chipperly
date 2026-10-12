/**
 * Whether a row's picture options may offer Done / Not done in one tap.
 * A task without steps always may. A routine with steps may only finish in one
 * go the ways the row already allows: the "Mark all done" button (when the team
 * shows it) or the check circle's whole-routine bonus with no step ticked yet.
 * A finished routine is never un-ticked from here, so its steps stay as they are.
 */
export function canTickInOneTap(row: {
  hasSteps: boolean;
  done: boolean;
  stepsDone: number;
  showMarkAllDone: boolean;
  routineBonus: boolean;
}): boolean {
  if (!row.hasSteps) return true;
  if (row.done) return false;
  return row.showMarkAllDone || (row.routineBonus && row.stepsDone === 0);
}
