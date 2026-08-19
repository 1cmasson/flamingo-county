import * as migration_20260819_011519_initial from './20260819_011519_initial';

export const migrations = [
  {
    up: migration_20260819_011519_initial.up,
    down: migration_20260819_011519_initial.down,
    name: '20260819_011519_initial'
  },
];
