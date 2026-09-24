import * as migration_20260924_211013_initial from './20260924_211013_initial';

export const migrations = [
  {
    up: migration_20260924_211013_initial.up,
    down: migration_20260924_211013_initial.down,
    name: '20260924_211013_initial'
  },
];
