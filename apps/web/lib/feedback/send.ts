import type { FeedbackBody, FeedbackKind } from '@chipperly/shared/schemas/feedback';
import { apiBase } from '../api/base';
import { getTokens } from '../api/client';

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  contactOk: boolean;
  contactEmail: string;
  /** Dollars per month, as typed. */
  bargain: string;
  expensive: string;
  tooExpensive: string;
}

const dollars = (typed: string): number | undefined => {
  const cleaned = typed.replace(/[^0-9.]/g, '');
  const n = Math.round(Number(cleaned));
  return cleaned !== '' && Number.isFinite(n) && n <= 10_000 ? n : undefined;
};

/** What goes over the wire: empty optional fields are left out, the email only when they said we may write back. */
export function buildFeedbackBody(draft: FeedbackDraft, page: string, appVersion?: string): FeedbackBody {
  return {
    kind: draft.kind,
    message: draft.message.trim(),
    contact_ok: draft.contactOk,
    rating: draft.rating ?? undefined,
    contact_email: draft.contactOk && draft.contactEmail.trim() ? draft.contactEmail.trim() : undefined,
    page: page.slice(0, 200),
    app_version: appVersion,
    price_bargain: dollars(draft.bargain),
    price_expensive: dollars(draft.expensive),
    price_too_expensive: dollars(draft.tooExpensive),
  };
}

/**
 * Plain fetch, not lib/api/client: a guest trying the demo is blocked from the
 * client (their data never leaves the device) but may still tell us what they think.
 * Signed in, the token lets the server record who it was.
 */
export async function sendFeedback(body: FeedbackBody): Promise<boolean> {
  try {
    const tokens = await getTokens();
    const res = await fetch(`${apiBase}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
