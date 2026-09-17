import { z } from 'zod';
import { SyncColumnsSchema, uuidSchema } from './common.js';

export const SocialStorySchema = SyncColumnsSchema.extend({
  title: z.string().min(1),
  emoji: z.string().nullable(),
  cover_photo_id: uuidSchema.nullable(),
  position: z.number().int(),
});
export type SocialStory = z.infer<typeof SocialStorySchema>;

export const StoryPageSchema = SyncColumnsSchema.extend({
  story_id: uuidSchema,
  position: z.number().int(),
  text: z.string().min(1),
  emoji: z.string().nullable(),
  photo_id: uuidSchema.nullable(),
});
export type StoryPage = z.infer<typeof StoryPageSchema>;
