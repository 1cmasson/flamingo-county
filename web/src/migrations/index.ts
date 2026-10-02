import * as migration_20260820_183820_initial from './20260820_183820_initial';
import * as migration_20260820_215710_remove_pricing from './20260820_215710_remove_pricing';
import * as migration_20260901_204154_localize_event_time_label from './20260901_204154_localize_event_time_label';
import * as migration_20260903_220604_add_listing_logo from './20260903_220604_add_listing_logo';
import * as migration_20260903_221953_add_event_start_end_time from './20260903_221953_add_event_start_end_time';
import * as migration_20260928_164435_add_members from './20260928_164435_add_members';
import * as migration_20260930_194540_add_hq from './20260930_194540_add_hq';
import * as migration_20261001_141616_add_hq_social_stats from './20261001_141616_add_hq_social_stats';
import * as migration_20261001_152509_add_hq_mcp from './20261001_152509_add_hq_mcp';
import * as migration_20261001_170211_add_site_drafts from './20261001_170211_add_site_drafts';
import * as migration_20261001_182504_add_listing_hours_verified from './20261001_182504_add_listing_hours_verified';
import * as migration_20261001_193056_add_event_facts from './20261001_193056_add_event_facts';
import * as migration_20261001_220129_add_send_telegram_tool from './20261001_220129_add_send_telegram_tool';
import * as migration_20261001_232823_add_hq_playbook from './20261001_232823_add_hq_playbook';

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
    name: '20260903_221953_add_event_start_end_time',
  },
  {
    up: migration_20260928_164435_add_members.up,
    down: migration_20260928_164435_add_members.down,
    name: '20260928_164435_add_members',
  },
  {
    up: migration_20260930_194540_add_hq.up,
    down: migration_20260930_194540_add_hq.down,
    name: '20260930_194540_add_hq',
  },
  {
    up: migration_20261001_141616_add_hq_social_stats.up,
    down: migration_20261001_141616_add_hq_social_stats.down,
    name: '20261001_141616_add_hq_social_stats',
  },
  {
    up: migration_20261001_152509_add_hq_mcp.up,
    down: migration_20261001_152509_add_hq_mcp.down,
    name: '20261001_152509_add_hq_mcp',
  },
  {
    up: migration_20261001_170211_add_site_drafts.up,
    down: migration_20261001_170211_add_site_drafts.down,
    name: '20261001_170211_add_site_drafts',
  },
  {
    up: migration_20261001_182504_add_listing_hours_verified.up,
    down: migration_20261001_182504_add_listing_hours_verified.down,
    name: '20261001_182504_add_listing_hours_verified',
  },
  {
    up: migration_20261001_193056_add_event_facts.up,
    down: migration_20261001_193056_add_event_facts.down,
    name: '20261001_193056_add_event_facts',
  },
  {
    up: migration_20261001_220129_add_send_telegram_tool.up,
    down: migration_20261001_220129_add_send_telegram_tool.down,
    name: '20261001_220129_add_send_telegram_tool',
  },
  {
    up: migration_20261001_232823_add_hq_playbook.up,
    down: migration_20261001_232823_add_hq_playbook.down,
    name: '20261001_232823_add_hq_playbook'
  },
];
