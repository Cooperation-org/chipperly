import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

export const AccountKind = z.enum(['individual', 'household', 'agency']);
export type AccountKind = z.infer<typeof AccountKind>;

export const AccountSchema = z.object({
  id: uuidSchema,
  kind: AccountKind,
  name: z.string().min(1),
  created_at: msTimestampSchema,
});
export type Account = z.infer<typeof AccountSchema>;

export const Role = z.enum(['admin', 'member']);
export type Role = z.infer<typeof Role>;

/** A row of `account_members`: who belongs to an account and at what role. */
export const MembershipSchema = z.object({
  account_id: uuidSchema,
  user_id: uuidSchema,
  role: Role,
});
export type Membership = z.infer<typeof MembershipSchema>;

/**
 * The user fields safe to send to the client. Includes `pin_hash` because
 * PIN verification runs client-side against the cached hash (see
 * helpers/pin.ts); never includes `password_hash`.
 */
export const UserPublicSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  display_name: z.string().min(1),
  pin_hash: z.string().nullable(),
  email_verified_at: msTimestampSchema.nullable(),
  created_at: msTimestampSchema,
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const InviteSchema = z.object({
  id: uuidSchema,
  account_id: uuidSchema,
  email: z.string().email(),
  role: Role,
  profile_ids: z.array(uuidSchema),
  relationship_label: z.string().nullable(),
  token_hash: z.string(),
  expires_at: msTimestampSchema,
  accepted_at: msTimestampSchema.nullable(),
  invited_by: uuidSchema,
});
export type Invite = z.infer<typeof InviteSchema>;
