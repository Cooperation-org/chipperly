import * as migration_20260925_081636_initial from './20260925_081636_initial';

export const migrations = [
  {
    up: migration_20260925_081636_initial.up,
    down: migration_20260925_081636_initial.down,
    name: '20260925_081636_initial'
  },
];
