import * as migration_20260820_183820_initial from './20260820_183820_initial';

export const migrations = [
  {
    up: migration_20260820_183820_initial.up,
    down: migration_20260820_183820_initial.down,
    name: '20260820_183820_initial'
  },
];
