import { v7 as uuidv7 } from 'uuid';

export { materializedId } from '@chipperly/shared/helpers/recurrence';

/** New row id, uuid v7 (time-sortable, matches the shared namespace convention). */
export function newId(): string {
  return uuidv7();
}
