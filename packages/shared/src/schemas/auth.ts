import { z } from 'zod';
import { AccountSchema, Role, UserPublicSchema } from './account.js';
import { uuidSchema } from './common.js';
import { MediaKind } from './media.js';
import { ProfileSchema } from './profile.js';

const passwordSchema = z.string().min(8);

export const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  display_name: z.string().min(1),
  device_id: z.string().min(1).optional(),
  /** Closed beta gate (env.BETA_INVITE_CODE); ignored once the account is created. */
  invite_code: z.string().min(1).optional(),
  /** A pending account invite's raw token; a valid, unexpired one bypasses invite_code. */
  invite_token: z.string().min(1).optional(),
  /** Epoch ms when the "I'm a parent/guardian/caregiver, 18+, agree to Terms and Privacy" checkbox was ticked (S2). */
  consented_at: z.number(),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const GoogleAuthBodySchema = z.object({
  id_token: z.string().min(1),
  /** Closed beta gate; required only when this sign-in creates a new user. */
  invite_code: z.string().min(1).optional(),
  /** A pending account invite's raw token; a valid, unexpired one bypasses invite_code when this creates a new user. */
  invite_token: z.string().min(1).optional(),
  /** Epoch ms the consent checkbox was ticked; required only when this sign-in creates a new user (missing -> 409 consent_required). */
  consented_at: z.number().optional(),
});
export type GoogleAuthBody = z.infer<typeof GoogleAuthBodySchema>;

export const AppleAuthBodySchema = z.object({
  id_token: z.string().min(1),
  /** Closed beta gate; required only when this sign-in creates a new user. */
  invite_code: z.string().min(1).optional(),
  /** A pending account invite's raw token; a valid, unexpired one bypasses invite_code when this creates a new user. */
  invite_token: z.string().min(1).optional(),
  /** Epoch ms the consent checkbox was ticked; required only when this sign-in creates a new user (missing -> 409 consent_required). */
  consented_at: z.number().optional(),
});
export type AppleAuthBody = z.infer<typeof AppleAuthBodySchema>;

export const RefreshBodySchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshBody = z.infer<typeof RefreshBodySchema>;

export const ForgotPasswordBodySchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;

export const PinBodySchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'expected 4 to 6 digits'),
});
export type PinBody = z.infer<typeof PinBodySchema>;

export const TokensResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.literal(900),
});
export type TokensResponse = z.infer<typeof TokensResponseSchema>;

export const ProvidersResponseSchema = z.object({
  google: z.boolean(),
  apple: z.boolean(),
  invite_code_required: z.boolean(),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;

export const MeAccountSchema = z.object({
  account: AccountSchema,
  role: Role,
});
export type MeAccount = z.infer<typeof MeAccountSchema>;

export const MeResponseSchema = z.object({
  user: UserPublicSchema,
  accounts: z.array(MeAccountSchema),
  profiles: z.array(ProfileSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/**
 * GET /me/export (S30 "Download my data"): everything the signed-in user can
 * see. `tables` is keyed by every synced table name (packages/shared/src/
 * constants/tables.ts); each row keeps its own table's shape, so this stays a
 * loose record instead of a second copy of every table schema.
 */
export const ExportResponseSchema = z.object({
  exported_at: z.number(),
  user: UserPublicSchema.omit({ pin_hash: true }),
  accounts: z.array(AccountSchema),
  memberships: z.array(z.object({ account_id: uuidSchema, role: Role })),
  profiles: z.array(ProfileSchema),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  media: z.array(
    z.object({
      id: uuidSchema,
      url: z.string(),
      kind: MediaKind,
      created_at: z.number(),
    }),
  ),
});
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

export const CreateAccountBodySchema = z.object({
  kind: z.enum(['individual', 'household', 'agency']),
  name: z.string().min(1),
});
export type CreateAccountBody = z.infer<typeof CreateAccountBodySchema>;

export const CreateProfileBodySchema = z.object({
  name: z.string().min(1),
  emoji: z.string().nullable().optional(),
  photo_id: uuidSchema.nullable().optional(),
});
export type CreateProfileBody = z.infer<typeof CreateProfileBodySchema>;

export const InviteBodySchema = z.object({
  email: z.string().email(),
  role: Role,
  profile_ids: z.array(uuidSchema),
  relationship_label: z.string().nullable().optional(),
});
export type InviteBody = z.infer<typeof InviteBodySchema>;
