import type { ReportReason } from '@chipperly/shared/schemas/community';

/** docs/COMMUNITY.md: one function, no inline checks. Structural so it works before `is_support` reaches UserPublic. */
export function canModerate(user: { is_super_admin?: boolean; is_support?: boolean } | null | undefined): boolean {
  return user?.is_super_admin === true || user?.is_support === true;
}

/** child_safety first, on purpose. */
export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'child_safety', label: 'A child may be at risk' },
  { value: 'personal_information', label: 'Shares personal information' },
  { value: 'harassment', label: 'Unkind or harassing' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 24;
const NICKNAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Format rules only (the contract's Nickname). Whether it matches a profile name or the
 * email is checked by the API, which owns that rule; the UI shows the server's message.
 * Returns why a name is rejected, or null when it is fine.
 */
export function validateNickname(raw: string): string | null {
  const value = raw.trim();
  if (value.length < NICKNAME_MIN) return `Use at least ${NICKNAME_MIN} characters.`;
  if (value.length > NICKNAME_MAX) return `Use at most ${NICKNAME_MAX} characters.`;
  if (!NICKNAME_PATTERN.test(value)) {
    return 'Use letters, numbers, dashes and underscores only, starting with a letter or number. No spaces.';
  }
  return null;
}

export type ModerationAction = 'hide' | 'remove' | 'dismiss';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

/** What the moderation list returns. The reported content and resolver name are what the queue needs to show. */
export interface ModerationReport {
  id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  created_at: number;
  resolved_at: number | null;
  resolved_by_nickname?: string | null;
  action?: ModerationAction | null;
  resolution_note?: string | null;
  target?: {
    author_nickname: string | null;
    title?: string | null;
    body?: string | null;
    status: 'published' | 'hidden' | 'removed';
  } | null;
}
