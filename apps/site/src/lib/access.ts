import type { Access } from 'payload';

export const signedIn: Access = ({ req }) => Boolean(req.user);

// Visitors see published documents only; editors see drafts too.
export const signedInOrPublished: Access = ({ req }) =>
  req.user ? true : { _status: { equals: 'published' } };
