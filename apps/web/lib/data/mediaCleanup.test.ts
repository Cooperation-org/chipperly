import { describe, expect, it } from 'vitest';
import { collectUnreferencedUploaded } from './mediaCleanup';

const up = (media_id: string) => ({ media_id, uploaded: 1 as const });
const pending = (media_id: string) => ({ media_id, uploaded: 0 as const });

describe('collectUnreferencedUploaded', () => {
  it('keeps a referenced blob', () => {
    expect(collectUnreferencedUploaded([up('a')], [{ id: 'x', photo_id: 'a' }])).toEqual([]);
  });
  it('drops an unreferenced uploaded blob', () => {
    expect(collectUnreferencedUploaded([up('a'), up('b')], [{ photo_id: 'a' }])).toEqual(['b']);
  });
  it('keeps an unreferenced blob that is not uploaded yet', () => {
    expect(collectUnreferencedUploaded([pending('a')], [])).toEqual([]);
  });
  it('keeps a blob referenced only from profile settings', () => {
    const profile = { id: 'p', settings: { first_then_first_audio_id: 'a', nested: { clips: ['b'] } } };
    expect(collectUnreferencedUploaded([up('a'), up('b'), up('c')], [profile])).toEqual(['c']);
  });
  it('keeps a blob referenced only by a queued outbox write', () => {
    expect(collectUnreferencedUploaded([up('a')], [{ op: 'upsert', row: { audio_id: 'a' } }])).toEqual([]);
  });
});
