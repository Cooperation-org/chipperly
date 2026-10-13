import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';
import { AccountSchema } from './account.js';

export const ORG_TYPES = ['aba', 'habilitation', 'respite', 'school', 'other'] as const;
export const OrgTypeSchema = z.enum(ORG_TYPES);
export type OrgType = z.infer<typeof OrgTypeSchema>;

/** Most people one bulk request may carry. */
export const BULK_PEOPLE_MAX = 1000;
export const PERSON_NAME_MAX = 100;
export const CLUSTER_NAME_MAX = 80;

/** PATCH /accounts/:id/org. */
export const UpdateOrgBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  org_type: OrgTypeSchema.nullable().optional(),
  org_size_estimate: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export type UpdateOrgBody = z.infer<typeof UpdateOrgBodySchema>;

export const OrgAccountResponseSchema = z.object({ account: AccountSchema });

export const ClusterSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  archived_at: msTimestampSchema.nullable(),
  /** People in it who are not archived. */
  profile_count: z.number().int().nonnegative(),
});
export type Cluster = z.infer<typeof ClusterSchema>;

export const ClustersResponseSchema = z.object({ clusters: z.array(ClusterSchema) });
export type ClustersResponse = z.infer<typeof ClustersResponseSchema>;

export const CreateClusterBodySchema = z.object({ name: z.string().trim().min(1).max(CLUSTER_NAME_MAX) });
export type CreateClusterBody = z.infer<typeof CreateClusterBodySchema>;

export const UpdateClusterBodySchema = z.object({
  name: z.string().trim().min(1).max(CLUSTER_NAME_MAX).optional(),
  archived: z.boolean().optional(),
});
export type UpdateClusterBody = z.infer<typeof UpdateClusterBodySchema>;

export const RosterStatusSchema = z.enum(['active', 'archived', 'all']);
export type RosterStatus = z.infer<typeof RosterStatusSchema>;

/** `cluster_id` may be 'none' for people in no cluster. */
export const RosterQuerySchema = z.object({
  cluster_id: z.union([uuidSchema, z.literal('none')]).optional(),
  status: RosterStatusSchema.default('active'),
  q: z.string().trim().max(100).optional(),
});
export type RosterQuery = z.input<typeof RosterQuerySchema>;

export const RosterPersonSchema = z.object({
  profile_id: uuidSchema,
  name: z.string(),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
  cluster_id: uuidSchema.nullable(),
  archived_at: msTimestampSchema.nullable(),
  team: z.array(z.object({ user_id: uuidSchema, display_name: z.string(), role: z.enum(['admin', 'member', 'viewer']) })),
});
export type RosterPerson = z.infer<typeof RosterPersonSchema>;

/** `limit` is null until the org has a seat limit. `over` is only sent by bulk add. */
export const SeatsSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  over: z.boolean().optional(),
});
export type Seats = z.infer<typeof SeatsSchema>;

export const RosterResponseSchema = z.object({ people: z.array(RosterPersonSchema), seats: SeatsSchema });
export type RosterResponse = z.infer<typeof RosterResponseSchema>;

/** One row of a bulk add. Exactly what parsePeopleList returns. */
export const BulkPersonSchema = z.object({
  name: z.string().trim().min(1).max(PERSON_NAME_MAX),
  cluster_id: uuidSchema.nullish(),
  cluster_name: z.string().trim().min(1).max(CLUSTER_NAME_MAX).nullish(),
  parent_email: z.string().trim().email().max(254).nullish(),
});
export type BulkPerson = z.infer<typeof BulkPersonSchema>;

/** Rows are checked one by one so a bad row does not fail the rest; only the count is checked here. */
export const BulkProfilesBodySchema = z.object({ people: z.array(z.unknown()).min(1).max(BULK_PEOPLE_MAX) });
export type BulkProfilesBody = { people: BulkPerson[] };

export const BulkProfilesResponseSchema = z.object({
  created: z.array(z.object({ profile_id: uuidSchema, name: z.string() })),
  invites_sent: z.number().int().nonnegative(),
  errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })),
  seats: SeatsSchema,
});
export type BulkProfilesResponse = z.infer<typeof BulkProfilesResponseSchema>;

/** PATCH /accounts/:id/profiles/:pid. `cluster_id: null` takes the person out of their cluster. */
export const UpdateOrgProfileBodySchema = z.object({
  cluster_id: uuidSchema.nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateOrgProfileBody = z.infer<typeof UpdateOrgProfileBodySchema>;
