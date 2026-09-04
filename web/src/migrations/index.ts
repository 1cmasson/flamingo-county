import * as migration_20260820_183820_initial from './20260820_183820_initial';
import * as migration_20260820_215710_remove_pricing from './20260820_215710_remove_pricing';
import * as migration_20260901_204154_localize_event_time_label from './20260901_204154_localize_event_time_label';
import * as migration_20260903_220604_add_listing_logo from './20260903_220604_add_listing_logo';
import * as migration_20260903_221953_add_event_start_end_time from './20260903_221953_add_event_start_end_time';

export const migrations = [
  {
    up: migration_20260820_183820_initial.up,
    down: migration_20260820_183820_initial.down,
    name: '20260820_183820_initial',
  },
  {
    up: migration_20260820_215710_remove_pricing.up,
    down: migration_20260820_215710_remove_pricing.down,
    name: '20260820_215710_remove_pricing',
  },
  {
    up: migration_20260901_204154_localize_event_time_label.up,
    down: migration_20260901_204154_localize_event_time_label.down,
    name: '20260901_204154_localize_event_time_label',
  },
  {
    up: migration_20260903_220604_add_listing_logo.up,
    down: migration_20260903_220604_add_listing_logo.down,
    name: '20260903_220604_add_listing_logo',
  },
  {
    up: migration_20260903_221953_add_event_start_end_time.up,
    down: migration_20260903_221953_add_event_start_end_time.down,
    name: '20260903_221953_add_event_start_end_time'
  },
];
