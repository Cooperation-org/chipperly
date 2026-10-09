import { payload } from './payload';
import { BRAND, SITE_NAME } from './site';

export const BLOG_TITLE = 'Ideas for calmer days';
export const BLOG_INTRO =
  'Practical ideas on visual schedules, routines, transitions and rewards, from the family and team behind Chipperly.';
// Visible intro on the blog pages (first mention). BLOG_INTRO stays plain for meta, JSON-LD and RSS.
export const BLOG_INTRO_VISIBLE = BLOG_INTRO.replace(SITE_NAME, BRAND);

export async function getCategories() {
  const { docs } = await (await payload()).find({ collection: 'categories', limit: 100, sort: 'title', depth: 0 });
  return docs;
}
