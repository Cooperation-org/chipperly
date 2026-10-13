import { z } from 'zod';
import { uuidSchema } from './common.js';

export const HANDOVER_REASONS = ['archived', 'removed', 'lapsed'] as const;
export const HandoverReasonSchema = z.enum(HANDOVER_REASONS);
export type HandoverReason = z.infer<typeof HandoverReasonSchema>;

/** One "Family keeps a copy" offer, as the family member sees it. */
export const HandoverSchema = z.object({
  id: uuidSchema,
  profile_name: z.string(),
  org_name: z.string(),
  reason: HandoverReasonSchema,
});
export type Handover = z.infer<typeof HandoverSchema>;

/** GET /me/handovers: the offers still open for this user (drives the banner). */
export const HandoversResponseSchema = z.object({ handovers: z.array(HandoverSchema) });

/** POST /handovers/:key/accept. */
export const HandoverAcceptResponseSchema = z.object({ account_id: uuidSchema, profile_id: uuidSchema });
export type HandoverAcceptResponse = z.infer<typeof HandoverAcceptResponseSchema>;
