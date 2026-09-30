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
});
export type CommunityPost = z.infer<typeof CommunityPostSchema>;

export const CommunityCommentSchema = z.object({
  id: uuidSchema,
  post_id: uuidSchema,
  body: z.string(),
  status: PostStatusSchema,
  created_at: msTimestampSchema,
  author: CommunityAuthorSchema,
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
  })
  .refine((v) => v.kind === 'post' || v.payload !== undefined, { message: 'payload required for story and routine' })
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

export const FeedResponseSchema = z.object({
  posts: z.array(CommunityPostSchema),
  next_cursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
