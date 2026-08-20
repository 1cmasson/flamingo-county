import * as migration_20260820_183820_initial from './20260820_183820_initial';
import * as migration_20260820_215710_remove_pricing from './20260820_215710_remove_pricing';

export const migrations = [
  {
    up: migration_20260820_183820_initial.up,
    down: migration_20260820_183820_initial.down,
    name: '20260820_183820_initial',
  },
  {
    up: migration_20260820_215710_remove_pricing.up,
    down: migration_20260820_215710_remove_pricing.down,
    name: '20260820_215710_remove_pricing'
  },
];
