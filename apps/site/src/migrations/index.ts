import * as migration_20260925_081636_initial from './20260925_081636_initial';
import * as migration_20260925_091310_email_addresses from './20260925_091310_email_addresses';
import * as migration_20260925_163549_email_also_forward_to from './20260925_163549_email_also_forward_to';
import * as migration_20261012_090145_unsubscribes from './20261012_090145_unsubscribes';
import * as migration_20261012_090436_newsletters from './20261012_090436_newsletters';
import * as migration_20261012_090522_post_email_subscribers from './20261012_090522_post_email_subscribers';
import * as migration_20261012_130000_support_team_wording from './20261012_130000_support_team_wording';
import * as migration_20261013_100000_waitlist_invited from './20261013_100000_waitlist_invited';

export const migrations = [
  {
    up: migration_20260925_081636_initial.up,
    down: migration_20260925_081636_initial.down,
    name: '20260925_081636_initial',
  },
  {
    up: migration_20260925_091310_email_addresses.up,
    down: migration_20260925_091310_email_addresses.down,
    name: '20260925_091310_email_addresses',
  },
  {
    up: migration_20260925_163549_email_also_forward_to.up,
    down: migration_20260925_163549_email_also_forward_to.down,
    name: '20260925_163549_email_also_forward_to',
  },
  {
    up: migration_20261012_090145_unsubscribes.up,
    down: migration_20261012_090145_unsubscribes.down,
    name: '20261012_090145_unsubscribes',
  },
  {
    up: migration_20261012_090436_newsletters.up,
    down: migration_20261012_090436_newsletters.down,
    name: '20261012_090436_newsletters',
  },
  {
    up: migration_20261012_090522_post_email_subscribers.up,
    down: migration_20261012_090522_post_email_subscribers.down,
    name: '20261012_090522_post_email_subscribers'
  },
  {
    up: migration_20261012_130000_support_team_wording.up,
    down: migration_20261012_130000_support_team_wording.down,
    name: '20261012_130000_support_team_wording',
  },
  {
    up: migration_20261013_100000_waitlist_invited.up,
    down: migration_20261013_100000_waitlist_invited.down,
    name: '20261013_100000_waitlist_invited',
  },
];
