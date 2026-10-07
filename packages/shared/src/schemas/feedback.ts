import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

export const FeedbackKind = z.enum(['bug', 'idea', 'question', 'love']);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

export const FeedbackStatus = z.enum(['new', 'done']);
export type FeedbackStatus = z.infer<typeof FeedbackStatus>;

/** Whole dollars per month. The three optional answers behind a pricing survey (too cheap is skipped: nobody has said it). */
const priceSchema = z.number().int().min(0).max(10_000);

/** What the app sends. Signed-in or not: a guest can leave feedback too. */
export const FeedbackBodySchema = z.object({
  kind: FeedbackKind,
  message: z.string().trim().min(1).max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  /** They said we may write back. Needs an email: their account's, or `contact_email` for a guest. */
  contact_ok: z.boolean().default(false),
  contact_email: z.string().trim().email().max(200).optional(),
  page: z.string().max(200).optional(),
  app_version: z.string().max(40).optional(),
  price_bargain: priceSchema.optional(),
  price_expensive: priceSchema.optional(),
  price_too_expensive: priceSchema.optional(),
});
export type FeedbackBody = z.infer<typeof FeedbackBodySchema>;

export const FeedbackItemSchema = z.object({
  id: uuidSchema,
  created_at: msTimestampSchema,
  kind: FeedbackKind,
  message: z.string(),
  rating: z.number().int().nullable(),
  contact_email: z.string().nullable(),
  page: z.string().nullable(),
  account_kind: z.string().nullable(),
  signed_in: z.boolean(),
  price_bargain: z.number().int().nullable(),
  price_expensive: z.number().int().nullable(),
  price_too_expensive: z.number().int().nullable(),
  status: FeedbackStatus,
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const FeedbackListSchema = z.object({ items: z.array(FeedbackItemSchema) });
export type FeedbackList = z.infer<typeof FeedbackListSchema>;

export const FeedbackStatusBodySchema = z.object({ status: FeedbackStatus });
