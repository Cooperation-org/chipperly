import * as migration_20260925_081636_initial from './20260925_081636_initial';
import * as migration_20260925_091310_email_addresses from './20260925_091310_email_addresses';
import * as migration_20260925_163549_email_also_forward_to from './20260925_163549_email_also_forward_to';

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
    name: '20260925_163549_email_also_forward_to'
  },
];
