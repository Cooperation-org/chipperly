import { describe, expect, it } from 'vitest';
import { buildFeedbackBody, canSend, type FeedbackDraft } from './send';

const draft: FeedbackDraft = { kind: 'idea', message: '  Add a dark mode  ', rating: null, contactOk: false, contactEmail: '', problem: '', helped: '', easier: '', frustrated: '', liked: '', recommend: '', price: '' };

describe('buildFeedbackBody', () => {
  it('trims the message and leaves out what was not filled in', () => {
    const body = buildFeedbackBody(draft, '/chips/');
    expect(body).toMatchObject({ kind: 'idea', message: 'Add a dark mode', contact_ok: false, page: '/chips/' });
    expect(body.rating).toBeUndefined();
    expect(body.q_price_monthly).toBeUndefined();
  });

  it('keeps the email only when they said we may write back, and turns typed prices into whole dollars', () => {
    const typed = { ...draft, rating: 4, contactEmail: ' me@example.com ', price: '$12.4' };
    expect(buildFeedbackBody(typed, '/')).toMatchObject({ contact_email: undefined, rating: 4, q_price_monthly: 12 });
    expect(buildFeedbackBody({ ...typed, price: 'lots' }, '/').q_price_monthly).toBeUndefined();
    expect(buildFeedbackBody({ ...typed, contactOk: true }, '/').contact_email).toBe('me@example.com');
  });

  it('sends the survey answers, trimmed, and leaves blank ones out', () => {
    const body = buildFeedbackBody({ ...draft, message: '', problem: ' too many tabs ', helped: 'partly', liked: '   ' }, '/');
    expect(body).toMatchObject({ message: '', q_problem: 'too many tabs', q_helped: 'partly' });
    expect(body.q_liked).toBeUndefined();
  });

  it('needs a message or at least one survey answer', () => {
    expect(canSend({ ...draft, message: '  ' })).toBe(false);
    expect(canSend({ ...draft, message: '', liked: 'the timer' })).toBe(true);
    expect(canSend({ ...draft, message: '', helped: 'no' })).toBe(true);
    expect(canSend({ ...draft, message: '', price: '0' })).toBe(true);
    expect(canSend(draft)).toBe(true);
  });
});
