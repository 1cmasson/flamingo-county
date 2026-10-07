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
import * as migration_20261001_233149_add_social_draft_source from './20261001_233149_add_social_draft_source';
import * as migration_20261002_004829_add_hq_chat_turns from './20261002_004829_add_hq_chat_turns';
import * as migration_20261002_005459_add_hq_playbook from './20261002_005459_add_hq_playbook';
import * as migration_20261002_020917_add_growth_loop from './20261002_020917_add_growth_loop';
import * as migration_20261002_060000_replace_flamingo_mascot from './20261002_060000_replace_flamingo_mascot';
import * as migration_20261005_145545_add_event_season from './20261005_145545_add_event_season';
import * as migration_20261005_154532_add_venue_photos from './20261005_154532_add_venue_photos';
import * as migration_20261005_165632_add_event_setting from './20261005_165632_add_event_setting';
import * as migration_20261005_213633_add_upload_media_tool from './20261005_213633_add_upload_media_tool';
import * as migration_20261006_002646_add_cancel_draft_tool from './20261006_002646_add_cancel_draft_tool';
import * as migration_20261006_013746_add_listing_answer from './20261006_013746_add_listing_answer';
import * as migration_20261006_145921_add_request_kinds from './20261006_145921_add_request_kinds';
import * as migration_20261007_120000_add_gems_category from './20261007_120000_add_gems_category';
import * as migration_20261007_125000_gem_label from './20261007_125000_gem_label';
import * as migration_20261007_170624_add_site_artwork_tool from './20261007_170624_add_site_artwork_tool';
import * as migration_20261007_183854_add_artwork_upload_links from './20261007_183854_add_artwork_upload_links';

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
    up: migration_20261001_233149_add_social_draft_source.up,
    down: migration_20261001_233149_add_social_draft_source.down,
    name: '20261001_233149_add_social_draft_source',
  },
  {
    up: migration_20261002_004829_add_hq_chat_turns.up,
    down: migration_20261002_004829_add_hq_chat_turns.down,
    name: '20261002_004829_add_hq_chat_turns',
  },
  {
    up: migration_20261002_005459_add_hq_playbook.up,
    down: migration_20261002_005459_add_hq_playbook.down,
    name: '20261002_005459_add_hq_playbook',
  },
  {
    up: migration_20261002_020917_add_growth_loop.up,
    down: migration_20261002_020917_add_growth_loop.down,
    name: '20261002_020917_add_growth_loop',
  },
  {
    up: migration_20261002_060000_replace_flamingo_mascot.up,
    down: migration_20261002_060000_replace_flamingo_mascot.down,
    name: '20261002_060000_replace_flamingo_mascot',
  },
  {
    up: migration_20261005_145545_add_event_season.up,
    down: migration_20261005_145545_add_event_season.down,
    name: '20261005_145545_add_event_season',
  },
  {
    up: migration_20261005_154532_add_venue_photos.up,
    down: migration_20261005_154532_add_venue_photos.down,
    name: '20261005_154532_add_venue_photos',
  },
  {
    up: migration_20261005_165632_add_event_setting.up,
    down: migration_20261005_165632_add_event_setting.down,
    name: '20261005_165632_add_event_setting',
  },
  {
    up: migration_20261005_213633_add_upload_media_tool.up,
    down: migration_20261005_213633_add_upload_media_tool.down,
    name: '20261005_213633_add_upload_media_tool',
  },
  {
    up: migration_20261006_002646_add_cancel_draft_tool.up,
    down: migration_20261006_002646_add_cancel_draft_tool.down,
    name: '20261006_002646_add_cancel_draft_tool',
  },
  {
    up: migration_20261006_013746_add_listing_answer.up,
    down: migration_20261006_013746_add_listing_answer.down,
    name: '20261006_013746_add_listing_answer',
  },
  {
    up: migration_20261006_145921_add_request_kinds.up,
    down: migration_20261006_145921_add_request_kinds.down,
    name: '20261006_145921_add_request_kinds',
  },
  {
    up: migration_20261007_120000_add_gems_category.up,
    down: migration_20261007_120000_add_gems_category.down,
    name: '20261007_120000_add_gems_category',
  },
  {
    up: migration_20261007_125000_gem_label.up,
    down: migration_20261007_125000_gem_label.down,
    name: '20261007_125000_gem_label',
  },
  {
    up: migration_20261007_170624_add_site_artwork_tool.up,
    down: migration_20261007_170624_add_site_artwork_tool.down,
    name: '20261007_170624_add_site_artwork_tool',
  },
  {
    up: migration_20261007_183854_add_artwork_upload_links.up,
    down: migration_20261007_183854_add_artwork_upload_links.down,
    name: '20261007_183854_add_artwork_upload_links'
  },
];
