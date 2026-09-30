import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

/** 3-24 chars; stored as typed, unique case-insensitively. */
export const NicknameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'letters, numbers, - and _ only');

export const PostKindSchema = z.enum(['post', 'story', 'routine']);
export type PostKind = z.infer<typeof PostKindSchema>;

export const PostStatusSchema = z.enum(['published', 'hidden', 'removed']);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const ReportReasonSchema = z.enum(['child_safety', 'personal_information', 'harassment', 'spam', 'other']);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ReportStatusSchema = z.enum(['open', 'actioned', 'dismissed']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const CommunityMediaKindSchema = z.enum(['image', 'audio']);
export type CommunityMediaKind = z.infer<typeof CommunityMediaKindSchema>;

/** The only thing public responses say about a person. */
export const CommunityAuthorSchema = z.object({
  nickname: z.string(),
  is_support: z.boolean(),
});
export type CommunityAuthor = z.infer<typeof CommunityAuthorSchema>;

/** What the caller may do with one item. Says nothing about anyone else. */
export const CommunityViewerSchema = z.object({
  /** The signed-in caller wrote it. */
  is_mine: z.boolean(),
  /** The caller is support or super admin, so Delete shows on other people's items. */
  can_moderate: z.boolean(),
});
export const DEFAULT_VIEWER = { is_mine: false, can_moderate: false } as const;

/** Integer minor units (cents) and a lowercase ISO 4217 code. The seller picks both; nothing is preset. */
export const PriceSchema = z.object({
  amount: z.number().int().positive().max(99_999_999),
  currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/, 'three-letter currency code'),
});
export type Price = z.infer<typeof PriceSchema>;

export const CommunityProfileSchema = z.object({
  nickname: z.string().nullable(),
});
export type CommunityProfile = z.infer<typeof CommunityProfileSchema>;

export const CommunityPostMediaSchema = z.object({
  media_id: uuidSchema,
  kind: CommunityMediaKindSchema,
  position: z.number().int().nonnegative(),
});

export const CommunityPostSchema = z.object({
  id: uuidSchema,
  kind: PostKindSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  /** Snapshot of the shared story or routine. Never a live link. */
  payload: z.unknown().nullable(),
  include_audio: z.boolean(),
  status: PostStatusSchema,
  created_at: msTimestampSchema,
  updated_at: msTimestampSchema,
  author: CommunityAuthorSchema,
  media: z.array(CommunityPostMediaSchema),
  /** Null = free. */
  price: PriceSchema.nullable().default(null),
  /** False on a paid item the caller has not bought: `payload` is then null. Always true when free. */
  has_access: z.boolean().default(true),
  viewer: CommunityViewerSchema.default(DEFAULT_VIEWER),
});
export type CommunityPost = z.infer<typeof CommunityPostSchema>;

export const CommunityCommentSchema = z.object({
  id: uuidSchema,
  post_id: uuidSchema,
  body: z.string(),
  status: PostStatusSchema,
  created_at: msTimestampSchema,
  author: CommunityAuthorSchema,
  viewer: CommunityViewerSchema.default(DEFAULT_VIEWER),
});
export type CommunityComment = z.infer<typeof CommunityCommentSchema>;

/** What a moderator sees. No reporter identity. */
export const CommunityReportSchema = z.object({
  id: uuidSchema,
  target_type: z.enum(['post', 'comment']),
  target_id: uuidSchema,
  reason: ReportReasonSchema,
  note: z.string().nullable(),
  status: ReportStatusSchema,
  created_at: msTimestampSchema,
  resolved_at: msTimestampSchema.nullable(),
  target: z
    .object({
      title: z.string().nullable(),
      body: z.string().nullable(),
      status: PostStatusSchema,
      author_nickname: z.string().nullable(),
    })
    .nullable(),
});
export type CommunityReport = z.infer<typeof CommunityReportSchema>;

export const SetNicknameBodySchema = z.object({ nickname: NicknameSchema });

export const CreatePostBodySchema = z
  .object({
    kind: PostKindSchema.default('post'),
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    include_audio: z.boolean().default(false),
    author_profile_id: uuidSchema.optional(),
    media: z
      .array(z.object({ media_id: uuidSchema, kind: CommunityMediaKindSchema }))
      .max(10)
      .default([]),
    /** Omitted = free. Only a story or routine can be sold, and the API refuses it unless payouts are set up. */
    price: PriceSchema.optional(),
  })
  .refine((v) => v.kind === 'post' || v.payload !== undefined, { message: 'payload required for story and routine' })
  .refine((v) => v.price === undefined || v.kind !== 'post', { message: 'only a story or routine can have a price' })
  .refine((v) => v.price === undefined || v.title !== undefined, { message: 'a priced item needs a title' })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.media.length > 0 || v.payload !== undefined, {
    message: 'empty post',
  });
export type CreatePostBody = z.infer<typeof CreatePostBodySchema>;

export const UpdatePostBodySchema = z.object({
  title: z.string().trim().min(1).max(120).nullable().optional(),
  body: z.string().trim().min(1).max(5000).nullable().optional(),
});

export const CreateCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  author_profile_id: uuidSchema.optional(),
});

export const CreateReportBodySchema = z.object({
  target_type: z.enum(['post', 'comment']),
  target_id: uuidSchema,
  reason: ReportReasonSchema,
  note: z.string().trim().max(1000).optional(),
});

export const ResolveReportBodySchema = z.object({
  action: z.enum(['hide', 'remove', 'dismiss']),
  note: z.string().trim().max(1000).optional(),
});

export const CommentsResponseSchema = z.object({
  comments: z.array(CommunityCommentSchema),
  next_cursor: z.string().nullable(),
});
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;

/** GET /community/selling. The route 404s when Stripe is not configured, so the web hides selling on a 404. */
export const SellerStatusSchema = z.object({
  connected: z.boolean(),
  details_submitted: z.boolean(),
  charges_enabled: z.boolean(),
  payouts_enabled: z.boolean(),
  /** The owner has set a platform fee on the server. Without one nothing can be priced. */
  fee_configured: z.boolean(),
  can_sell: z.boolean(),
  /** Plain-language reason `can_sell` is false; null when it is true. */
  reason: z.string().nullable(),
});
export type SellerStatus = z.infer<typeof SellerStatusSchema>;

export const StripeUrlResponseSchema = z.object({ url: z.string().url() });

export const FeedResponseSchema = z.object({
  posts: z.array(CommunityPostSchema),
  next_cursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
