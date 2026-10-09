import { z } from 'zod';
import { msTimestampSchema, uuidSchema } from './common.js';

export const FeedbackKind = z.enum(['bug', 'idea', 'question', 'love', 'nps']);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

export const FeedbackStatus = z.enum(['new', 'done']);
export type FeedbackStatus = z.infer<typeof FeedbackStatus>;

/** Whole dollars per month. */
const priceSchema = z.number().int().min(0).max(10_000);

/** One free-text survey answer. */
const answerSchema = z.string().trim().max(2000);

export const FeedbackHelped = z.enum(['yes', 'partly', 'no']);
export type FeedbackHelped = z.infer<typeof FeedbackHelped>;

/** The owner's beta survey, in order. Used by the form, the inbox and the team email. */
export const SURVEY_QUESTIONS = [
  { key: 'q_problem', label: 'What problem were you hoping to be able to solve by using Chipperly?' },
  { key: 'q_helped', label: 'Did using Chipperly help with this problem?' },
  { key: 'q_easier', label: 'How could Chipperly have helped you solve this problem more easily?' },
  { key: 'q_frustrated', label: 'What frustrated you about using Chipperly?' },
  { key: 'q_liked', label: 'What did you like about it?' },
  { key: 'q_recommend', label: 'Would you recommend this to others, why or why not?' },
  { key: 'q_price_monthly', label: 'How much would you be willing to pay a month to continue to use Chipperly?' },
] as const;

/** What the app sends. Signed-in or not: a guest can leave feedback too. */
export const FeedbackBodySchema = z
  .object({
  kind: FeedbackKind,
  /** May be empty when at least one survey answer is given. */
  message: z.string().trim().max(4000).default(''),
  rating: z.number().int().min(1).max(5).optional(),
  /** They said we may write back. Needs an email: their account's, or `contact_email` for a guest. */
  contact_ok: z.boolean().default(false),
  contact_email: z.string().trim().email().max(200).optional(),
  page: z.string().max(200).optional(),
  app_version: z.string().max(40).optional(),
  /** The beta survey. */
  q_problem: answerSchema.optional(),
  q_helped: FeedbackHelped.optional(),
  q_easier: answerSchema.optional(),
  q_frustrated: answerSchema.optional(),
  q_liked: answerSchema.optional(),
  q_recommend: answerSchema.optional(),
  q_price_monthly: priceSchema.optional(),
  /** 0 to 10, from the day 7 / day 21 prompt (kind `nps`). */
  nps_score: z.number().int().min(0).max(10).optional(),
})
  .refine((b) => b.message !== '' || b.nps_score !== undefined || SURVEY_QUESTIONS.some(({ key }) => (b[key] ?? '') !== ''), { message: 'Write a message or answer a question', path: ['message'] });
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
  q_problem: z.string().nullable(),
  q_helped: FeedbackHelped.nullable(),
  q_easier: z.string().nullable(),
  q_frustrated: z.string().nullable(),
  q_liked: z.string().nullable(),
  q_recommend: z.string().nullable(),
  q_price_monthly: z.number().int().nullable(),
  nps_score: z.number().int().nullable(),
  status: FeedbackStatus,
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const FeedbackListSchema = z.object({ items: z.array(FeedbackItemSchema) });
export type FeedbackList = z.infer<typeof FeedbackListSchema>;

export const FeedbackStatusBodySchema = z.object({ status: FeedbackStatus });
