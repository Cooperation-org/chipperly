import type { Tab } from 'payload';

// Questions shown as an accordion at the end of a post or page and
// published as FAQPage structured data, so search engines and AI answers
// can quote them.
export const faqTab: Tab = {
  label: 'FAQ',
  fields: [
    {
      name: 'faqs',
      label: 'Frequently asked questions',
      type: 'array',
      labels: { singular: 'Question', plural: 'Questions' },
      admin: {
        description: 'Real questions readers ask about this topic, answered in two to four plain sentences.',
        initCollapsed: true,
        components: { RowLabel: '/components/admin/FaqRowLabel#FaqRowLabel' },
      },
      fields: [
        { name: 'question', type: 'text', required: true, maxLength: 200 },
        { name: 'answer', type: 'textarea', required: true, maxLength: 1200 },
      ],
    },
  ],
};
