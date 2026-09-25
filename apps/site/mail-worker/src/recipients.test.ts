import { describe, expect, it } from 'vitest';
import { pickRecipients, pickRow } from './recipients';

describe('pickRecipients', () => {
  it('includes the destination and every extra, once, lowercased', () => {
    expect(pickRecipients('Tamar.Pixley@gmail.com', ['goodfortunecoffee0@gmail.com', ' tamar.pixley@gmail.com ', 'bad'])).toEqual([
      'tamar.pixley@gmail.com',
      'goodfortunecoffee0@gmail.com',
    ]);
  });
});

describe('pickRow', () => {
  const rows = [
    { id: 1, local_part: 'info', enabled: 1 },
    { id: 2, local_part: '*', enabled: 1 },
  ];
  it('matches the exact address first', () => expect(pickRow(rows, 'Info')?.id).toBe(1));
  it('falls back to the catch-all', () => expect(pickRow(rows, 'nobody')?.id).toBe(2));
  it('ignores a disabled address', () => expect(pickRow([{ id: 1, local_part: 'info', enabled: 0 }], 'info')).toBeUndefined());
});
