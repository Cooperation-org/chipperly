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

/** 'strict' notifies a care-team member only about their one assigned location; 'linked' about any of the child's location changes. */
export const LocationNotifyMode = z.enum(['strict', 'linked']);
export type LocationNotifyMode = z.infer<typeof LocationNotifyMode>;

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
  /** When the free trial ends (21 days from sign-up unless extended). Payments aren't wired yet, so nothing locks after it. */
  trial_ends_at: msTimestampSchema.optional(),
  /** The early access code this person claimed, and its discount once decided. */
  promo: z.object({ code: z.string(), percent_off: z.number().nullable() }).nullable().optional(),
  /** Listed in the server's SUPER_ADMIN_EMAILS: sees the admin dashboard. */
  is_super_admin: z.boolean().optional(),
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

/**
 * What creating or resending an invite returns: the public row plus the
 * one-time accept link, so the admin can hand it over by text or in person.
 * `email_sent` is false when the server has no mail provider configured
 * (RESEND_API_KEY unset), in which case the link is the only way in.
 */
export const InviteIssuedSchema = InvitePublicSchema.extend({
  invite_url: z.string().min(1),
  email_sent: z.boolean(),
});
export type InviteIssued = z.infer<typeof InviteIssuedSchema>;

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
  assigned_location_id: uuidSchema.nullable().optional(),
  location_notify_mode: LocationNotifyMode.nullable().optional(),
});
export type UpdateMemberBody = z.infer<typeof UpdateMemberBodySchema>;

/** One profile this member sees, plus that profile's own profile_members row: relationship + optional location assignment. */
export const AccountMemberProfileSchema = z.object({
  profile_id: uuidSchema,
  relationship_label: z.string().nullable(),
  assigned_location_id: uuidSchema.nullable(),
  location_notify_mode: LocationNotifyMode.nullable(),
});
export type AccountMemberProfile = z.infer<typeof AccountMemberProfileSchema>;

/** A row of S26 (care team): who, at what role, seeing which profiles. */
export const AccountMemberSchema = z.object({
  user: z.object({ id: uuidSchema, email: z.string().email(), display_name: z.string() }),
  role: Role,
  profiles: z.array(AccountMemberProfileSchema),
});
export type AccountMember = z.infer<typeof AccountMemberSchema>;

export const AccountMembersResponseSchema = z.object({
  members: z.array(AccountMemberSchema),
  invites: z.array(InvitePublicSchema),
});
export type AccountMembersResponse = z.infer<typeof AccountMembersResponseSchema>;
