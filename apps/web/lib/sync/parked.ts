import type { ParkedKind } from '@chipperly/shared/schemas/syncHealth';

// Pure decisions about writes that did not reach the server, split out of
// engine.ts and parkedStore.ts so they are testable without IndexedDB.

/**
 * What to do with a write the server refused. `stale` means the server had
 * something newer, which is last-write-wins working, not a loss. `locked`
 * and `lapsed` clear by themselves, so the write is held and sent again.
 * Anything else will be refused again however often it is sent.
 */
export function rejectionOutcome(reason: string): 'server_wins' | ParkedKind {
  if (reason === 'stale') return 'server_wins';
  if (reason === 'locked' || reason === 'lapsed') return 'held';
  return 'dead';
}

/**
 * A whole push answered with one of these will be answered the same way
 * every time: the request itself is wrong (400, 422), not allowed (403) or
 * too big (413). Retrying it as it is blocks every later write on the
 * device. 401 is the session's business and 5xx or 429 pass.
 */
export function isPermanentHttpFailure(status: number): boolean {
  return status === 400 || status === 403 || status === 413 || status === 422;
}

export interface UnsavedInput {
  state: 'synced' | 'pending' | 'offline' | 'error';
  pending: number;
  oldest_pending_at: number | null;
  dead: number;
}

export interface UnsavedNotice {
  /** `dead`: the server will not take these as they are. `stuck`: queued for too long. */
  level: 'dead' | 'stuck';
  count: number;
  message: string;
}

/** Queued this long while the server is answering with errors. */
const STUCK_ERROR_MS = 15 * 60 * 1000;
/** Queued this long whatever the reason: a day offline is worth saying out loud. */
const STUCK_ANY_MS = 24 * 60 * 60 * 1000;

const changes = (n: number): string => `${n} change${n === 1 ? '' : 's'}`;

/** Whether to tell the caregiver, in words, that this device holds work the account does not have. Null when all is well. */
export function unsavedNotice(input: UnsavedInput, now: number): UnsavedNotice | null {
  if (input.dead > 0) {
    return {
      level: 'dead',
      count: input.dead,
      message: `${changes(input.dead)} made on this device could not be saved to your account. ${input.dead === 1 ? 'It is' : 'They are'} still on this device.`,
    };
  }
  if (input.pending > 0 && input.oldest_pending_at !== null) {
    const age = now - input.oldest_pending_at;
    if (age > STUCK_ANY_MS || (input.state === 'error' && age > STUCK_ERROR_MS)) {
      return {
        level: 'stuck',
        count: input.pending,
        message:
          input.state === 'offline'
            ? `${changes(input.pending)} on this device ${input.pending === 1 ? 'has' : 'have'} not been saved to your account yet. Connect to the internet to save ${input.pending === 1 ? 'it' : 'them'}.`
            : `${changes(input.pending)} on this device ${input.pending === 1 ? 'has' : 'have'} not been saved to your account yet.`,
      };
    }
  }
  return null;
}

/** A device report is sent when the numbers changed, or this long after the last one so the server knows it is alive. */
const REPORT_EVERY_MS = 30 * 60 * 1000;

export function shouldReportHealth(signature: string, lastSignature: string | null, lastSentAt: number, now: number): boolean {
  return signature !== lastSignature || now - lastSentAt > REPORT_EVERY_MS;
}
