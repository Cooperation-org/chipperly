import { describe, expect, it } from 'vitest';
import { buildFeedbackBody, type FeedbackDraft } from './send';

const draft: FeedbackDraft = { kind: 'idea', message: '  Add a dark mode  ', rating: null, contactOk: false, contactEmail: '', bargain: '', expensive: '', tooExpensive: '' };

describe('buildFeedbackBody', () => {
  it('trims the message and leaves out what was not filled in', () => {
    const body = buildFeedbackBody(draft, '/chips/');
    expect(body).toMatchObject({ kind: 'idea', message: 'Add a dark mode', contact_ok: false, page: '/chips/' });
    expect(body.rating).toBeUndefined();
    expect(body.price_bargain).toBeUndefined();
  });

  it('keeps the email only when they said we may write back, and turns typed prices into whole dollars', () => {
    const typed = { ...draft, rating: 4, contactEmail: ' me@example.com ', bargain: '$8', expensive: '12.4', tooExpensive: 'lots' };
    expect(buildFeedbackBody(typed, '/')).toMatchObject({ contact_email: undefined, rating: 4, price_bargain: 8, price_expensive: 12 });
    expect(buildFeedbackBody(typed, '/').price_too_expensive).toBeUndefined();
    expect(buildFeedbackBody({ ...typed, contactOk: true }, '/').contact_email).toBe('me@example.com');
  });
});
