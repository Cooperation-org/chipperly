import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields';
import type { Tab } from 'payload';

// The SEO tab shared by posts and pages: title, description, share image,
// a Google-style preview and a noindex switch.
export const seoTab: Tab = {
  name: 'meta',
  label: 'SEO',
  fields: [
    OverviewField({ titlePath: 'meta.title', descriptionPath: 'meta.description', imagePath: 'meta.image' }),
    MetaTitleField({ hasGenerateFn: true }),
    MetaDescriptionField({ hasGenerateFn: true }),
    MetaImageField({ relationTo: 'media' }),
    PreviewField({ hasGenerateFn: true, titlePath: 'meta.title', descriptionPath: 'meta.description' }),
    {
      name: 'noindex',
      type: 'checkbox',
      label: 'Hide from search engines',
      admin: { description: 'Adds noindex and leaves the page out of the sitemap.' },
    },
  ],
};
