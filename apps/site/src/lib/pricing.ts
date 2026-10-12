// Prices in US dollars. The pricing page and llms.txt both read from here.
export const PLANS = [
  {
    name: 'Individual',
    month: 10,
    year: 100,
    text: 'One Primary User and the people who support them.',
  },
  {
    name: 'Household',
    month: 15,
    year: 150,
    text: 'Up to 2 admins and 6 Primary Users. Admins can also be Primary Users, but each one uses one of the six.',
  },
] as const;

export const BETA_YEAR = 75;
export const BETA_NOTE = `Beta testers who switch to an annual plan get 25% off ($${BETA_YEAR}/year for Individual).`;

export const ORG_TIERS = [
  { label: 'Pilot, up to 25 Primary Users', price: 1500, note: '90-day implementation, training, support and evaluation.' },
  { label: 'Up to 100 Primary Users', price: 6000 },
  { label: 'Up to 250 Primary Users', price: 12500 },
  { label: 'Up to 500 Primary Users', price: 20000 },
  { label: 'Up to 1,000 Primary Users', price: 35000 },
  { label: 'More than 1,000 Primary Users', price: null },
] as const;

export const ORG_FAMILY_NOTE =
  'Families connected to an organization use Chipperly for free while they are with that organization. If they leave, they keep their account and can pay for it themselves.';

export const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
export const tierPrice = (t: (typeof ORG_TIERS)[number]) => (t.price ? `${usd(t.price)}/year` : 'Custom, contact us');

// Plain-text block for llms.txt and llms-full.txt.
export const pricingText = (url: string) =>
  [
    `## Pricing (${url})`,
    '',
    ...PLANS.map((p) => `- **${p.name}**: ${usd(p.month)}/month or ${usd(p.year)}/year. ${p.text}`),
    '',
    BETA_NOTE,
    '',
    'Organizations pay an annual licence based on the number of Primary Users:',
    '',
    ...ORG_TIERS.map((t) => `- ${t.label}: ${tierPrice(t)}${'note' in t ? `. ${t.note}` : ''}`),
    '',
    ORG_FAMILY_NOTE,
  ].join('\n');
