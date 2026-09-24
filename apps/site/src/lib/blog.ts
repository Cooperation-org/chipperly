import { payload } from './payload';

export const BLOG_TITLE = 'Ideas for calmer days';
export const BLOG_INTRO =
  'Practical ideas on visual schedules, routines, transitions and rewards, from the family and team behind Chipperly.';

export async function getCategories() {
  const { docs } = await (await payload()).find({ collection: 'categories', limit: 100, sort: 'title', depth: 0 });
  return docs;
}
