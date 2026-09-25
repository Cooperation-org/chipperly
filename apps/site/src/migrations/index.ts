import * as migration_20260925_081636_initial from './20260925_081636_initial';
import * as migration_20260925_091310_email_addresses from './20260925_091310_email_addresses';

export const migrations = [
  {
    up: migration_20260925_081636_initial.up,
    down: migration_20260925_081636_initial.down,
    name: '20260925_081636_initial',
  },
  {
    up: migration_20260925_091310_email_addresses.up,
    down: migration_20260925_091310_email_addresses.down,
    name: '20260925_091310_email_addresses'
  },
];
