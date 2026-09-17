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
  /** null = registered with a password (S30 "connected sign-ins"). */
  auth_provider: z.enum(['google', 'apple']).nullable(),
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

/** `InviteSchema` without `token_hash`: what the invite-issuing routes hand back to a caregiver. */
export const InvitePublicSchema = InviteSchema.omit({ token_hash: true });
export type InvitePublic = z.infer<typeof InvitePublicSchema>;

/** Public info shown at S33 (accept invite) before the visitor signs in. */
export const InviteDetailsSchema = z.object({
  account_name: z.string(),
  inviter_name: z.string(),
  role: Role,
  profiles: z.array(z.object({ id: uuidSchema, name: z.string(), avatar_emoji: z.string().nullable() })),
  email: z.string().email(),
  expired: z.boolean(),
});
export type InviteDetails = z.infer<typeof InviteDetailsSchema>;

export const AcceptInviteResponseSchema = z.object({
  account_id: uuidSchema,
  profile_ids: z.array(uuidSchema),
});
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;

export const UpdateMemberBodySchema = z.object({
  role: Role.optional(),
  profile_ids: z.array(uuidSchema).optional(),
  relationship_label: z.string().nullable().optional(),
});
export type UpdateMemberBody = z.infer<typeof UpdateMemberBodySchema>;

/** A row of S26 (care team): who, at what role, seeing which profiles. */
export const AccountMemberSchema = z.object({
  user: z.object({ id: uuidSchema, email: z.string().email(), display_name: z.string() }),
  role: Role,
  profile_ids: z.array(uuidSchema),
});
export type AccountMember = z.infer<typeof AccountMemberSchema>;

export const AccountMembersResponseSchema = z.object({
  members: z.array(AccountMemberSchema),
  invites: z.array(InvitePublicSchema),
});
export type AccountMembersResponse = z.infer<typeof AccountMembersResponseSchema>;
