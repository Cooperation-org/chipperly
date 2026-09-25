import * as migration_20260924_211013_initial from './20260924_211013_initial';
import * as migration_20260925_074515_seo_faq_social_analytics from './20260925_074515_seo_faq_social_analytics';
import * as migration_20260925_074521_drop_social_label from './20260925_074521_drop_social_label';

export const migrations = [
  {
    up: migration_20260924_211013_initial.up,
    down: migration_20260924_211013_initial.down,
    name: '20260924_211013_initial',
  },
  {
    up: migration_20260925_074515_seo_faq_social_analytics.up,
    down: migration_20260925_074515_seo_faq_social_analytics.down,
    name: '20260925_074515_seo_faq_social_analytics',
  },
  {
    up: migration_20260925_074521_drop_social_label.up,
    down: migration_20260925_074521_drop_social_label.down,
    name: '20260925_074521_drop_social_label'
  },
];
