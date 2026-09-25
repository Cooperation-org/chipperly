import type { CollectionConfig } from 'payload';

// Uploads live in R2. Workers have no sharp, so Payload does not resize on
// upload; next/image resizes on request through the Cloudflare Images
// binding (wrangler.jsonc "images") and serves webp/avif to browsers that
// take it. Upload images at least 1600px wide.
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  admin: { defaultColumns: ['filename', 'alt', 'updatedAt'] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'Describe the image for screen readers and search engines.' },
    },
    { name: 'caption', type: 'text' },
  ],
  upload: {
    mimeTypes: ['image/*'],
    crop: false,
    focalPoint: false,
  },
};
