import { describe, expect, it } from 'vitest';
import { appendPage, canDelete, canEdit, commentsPath, feedPath, mergeById, normalizeCurrency, omitNull, sellingErrorMessage, toMinorUnits, isMine, isNicknameRequired, parsePayload, payloadToActivityInput, storyToPayload, toCard, type CommunityPost } from './community';
import { ApiError } from '../api/client';

function post(over: Record<string, unknown> = {}): CommunityPost {
  return {
    id: 'p1',
    kind: 'post',
    title: 'Hello',
    body: 'A body',
    payload: null,
    include_audio: false,
    media: [],
    author: { nickname: 'Sunny', is_support: false },
    created_at: 1000,
    ...over,
  } as unknown as CommunityPost;
}

describe('appendPage', () => {
  it('appends in order, drops duplicates, takes the new cursor', () => {
    const a = { posts: [post({ id: 'a' }), post({ id: 'b' })], next_cursor: 'c1' };
    const b = { posts: [post({ id: 'b' }), post({ id: 'c' })], next_cursor: null };
    const merged = appendPage(a, b);
    expect(merged.posts.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(merged.next_cursor).toBeNull();
  });
});

describe('feedPath', () => {
  it('adds cursor and kind only when set', () => {
    expect(feedPath(undefined, null)).toBe('/community/feed');
    expect(feedPath('story', 'abc')).toBe('/community/feed?cursor=abc&kind=story');
  });
});

describe('toCard', () => {
  it('maps to nickname only, orders media, truncates the excerpt', () => {
    const card = toCard(
      post({
        body: 'x'.repeat(300),
        media: [
          { media_id: 'i2', kind: 'image', position: 1 },
          { media_id: 'au', kind: 'audio', position: 2 },
          { media_id: 'i1', kind: 'image', position: 0 },
        ],
      }),
    );
    expect(card.image_ids).toEqual(['i1', 'i2']);
    expect(card.has_audio).toBe(true);
    expect(card.excerpt.endsWith('...')).toBe(true);
    expect(card.nickname).toBe('Sunny');
    expect(Object.keys(card)).not.toContain('email');
  });

  it('falls back to the snapshot title for a story with no post title', () => {
    const payload = { title: 'Haircut day', emoji: null, cover_photo_id: null, pages: [] };
    expect(toCard(post({ kind: 'story', title: null, payload })).title).toBe('Haircut day');
  });
});

describe('offline and errors', () => {
  it('recognises the nickname_required 409', () => {
    expect(isNicknameRequired(new ApiError(409, 'nickname_required'))).toBe(true);
    expect(isNicknameRequired(new ApiError(409, 'other'))).toBe(false);
    expect(isNicknameRequired(new Error('x'))).toBe(false);
  });
  it('isMine ignores case and needs a nickname', () => {
    expect(isMine({ nickname: 'Sunny' }, 'sunny')).toBe(true);
    expect(isMine({ nickname: 'Sunny' }, null)).toBe(false);
  });
});

describe('payload snapshots', () => {
  it('drops audio ids unless included', () => {
    const story = { title: 't', emoji: null, cover_photo_id: null };
    const pages = [{ text: 'a', emoji: null, photo_id: null, audio_id: 'aud' }];
    expect(storyToPayload(story, pages, false).pages[0]?.audio_id).toBeNull();
    expect(storyToPayload(story, pages, true).pages[0]?.audio_id).toBe('aud');
  });

  it('rejects a payload of the wrong shape', () => {
    expect(parsePayload('story', { nope: 1 })).toBeNull();
    expect(parsePayload('post', {})).toBeNull();
  });

  it('import remaps every step id and keeps the tree', () => {
    const payload = {
      name: 'Morning',
      emoji: null,
      photo_id: null,
      chip_value: 2,
      steps: [
        { id: 'A', parent_step_id: null, name: 'Bathroom', emoji: null, photo_id: null, duration_minutes: null },
        { id: 'B', parent_step_id: 'A', name: 'Teeth', emoji: null, photo_id: null, duration_minutes: 2 },
      ],
    };
    let n = 0;
    const input = payloadToActivityInput(payload, 'me', () => `new-${(n += 1)}`);
    expect(input.id).toBeUndefined();
    expect(input.steps.map((s) => s.id)).toEqual(['new-1', 'new-2']);
    expect(input.steps[1]?.parent_step_id).toBe('new-1');
    expect(input.location_ids).toEqual([]);
  });
});

describe('viewer capability', () => {
  it('author and moderator can delete, a stranger cannot; only the author edits', () => {
    expect(canDelete({ is_mine: true, can_moderate: false })).toBe(true);
    expect(canDelete({ is_mine: false, can_moderate: true })).toBe(true);
    expect(canDelete({ is_mine: false, can_moderate: false })).toBe(false);
    expect(canEdit({ is_mine: true, can_moderate: false })).toBe(true);
    expect(canEdit({ is_mine: false, can_moderate: true })).toBe(false);
  });
});

describe('paging helpers', () => {
  it('mergeById keeps order and drops repeats', () => {
    expect(mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('commentsPath adds an encoded cursor only when set', () => {
    expect(commentsPath('p1', null)).toBe('/community/posts/p1/comments');
    expect(commentsPath('p1', 'a+b/c=')).toBe('/community/posts/p1/comments?cursor=a%2Bb%2Fc%3D');
  });
  it('omitNull drops null and undefined but keeps false and empty', () => {
    expect(omitNull({ a: null, b: undefined, c: false, d: '', e: 0 })).toEqual({ c: false, d: '', e: 0 });
  });
});

describe('prices', () => {
  it('turns typed amounts into minor units for a two-decimal currency', () => {
    expect(toMinorUnits('4.99', 'usd')).toBe(499);
    expect(toMinorUnits('4,5', 'usd')).toBe(450);
    expect(toMinorUnits('12', 'usd')).toBe(1200);
  });
  it('honours a zero-decimal currency and rejects extra decimals', () => {
    expect(toMinorUnits('500', 'jpy')).toBe(500);
    expect(toMinorUnits('5.5', 'jpy')).toBeNull();
    expect(toMinorUnits('1.234', 'usd')).toBeNull();
  });
  it('rejects zero, negatives, words and empty', () => {
    for (const bad of ['0', '0.00', '-1', 'abc', '', ' ', '1e3']) expect(toMinorUnits(bad, 'usd')).toBeNull();
  });
  it('normalizes a currency code or refuses it', () => {
    expect(normalizeCurrency(' USD ')).toBe('usd');
    expect(normalizeCurrency('us')).toBeNull();
    expect(normalizeCurrency('us1')).toBeNull();
  });
});

describe('selling errors', () => {
  it('says why in plain words', () => {
    expect(sellingErrorMessage(new ApiError(409, 'seller_not_onboarded', 'Stripe has not finished checking your account'))).toBe(
      'Stripe has not finished checking your account',
    );
    expect(sellingErrorMessage(new ApiError(409, 'already_purchased'))).toBe('You already own this item.');
    expect(sellingErrorMessage(new Error('x'))).toContain('try again');
  });
});
