import type { FeedbackBody, FeedbackHelped, FeedbackKind } from '@chipperly/shared/schemas/feedback';
import { apiBase } from '../api/base';
import { getTokens } from '../api/client';

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  contactOk: boolean;
  contactEmail: string;
  /** The optional survey. Empty string means not answered. */
  problem: string;
  helped: FeedbackHelped | '';
  easier: string;
  frustrated: string;
  liked: string;
  recommend: string;
  /** Dollars per month, as typed. */
  price: string;
}

/** The note can go alone, or the survey can: one of them has to have something in it. */
export function canSend(draft: FeedbackDraft): boolean {
  return [draft.message, draft.problem, draft.easier, draft.frustrated, draft.liked, draft.recommend, draft.helped, dollars(draft.price) ?? ''].some((v) => String(v).trim() !== '');
}

const text = (typed: string): string | undefined => typed.trim() || undefined;

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
    q_problem: text(draft.problem),
    q_helped: draft.helped || undefined,
    q_easier: text(draft.easier),
    q_frustrated: text(draft.frustrated),
    q_liked: text(draft.liked),
    q_recommend: text(draft.recommend),
    q_price_monthly: dollars(draft.price),
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
