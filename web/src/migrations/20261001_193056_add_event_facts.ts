import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`end_date\` text;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`place_address\` text;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`organizer_id\` integer REFERENCES listings(id);`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`organizer_name\` text;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`organizer_url\` text;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`event_status\` text DEFAULT 'scheduled';`)
  await db.run(sql`CREATE INDEX \`events_organizer_idx\` ON \`events\` (\`organizer_id\`);`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_end_date\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_place_address\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_organizer_id\` integer REFERENCES listings(id);`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_organizer_name\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_organizer_url\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_event_status\` text DEFAULT 'scheduled';`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_organizer_idx\` ON \`_events_v\` (\`version_organizer_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`date\` text,
  	\`kind_id\` integer,
  	\`venue_type\` text DEFAULT 'listing',
  	\`listing_id\` integer,
  	\`hood\` text,
  	\`city_id\` integer,
  	\`start_time\` text,
  	\`end_time\` text,
  	\`star\` integer DEFAULT false,
  	\`going\` numeric DEFAULT 0,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_events\`("id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at", "_status") SELECT "id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at", "_status" FROM \`events\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`ALTER TABLE \`__new_events\` RENAME TO \`events\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`events_slug_idx\` ON \`events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`events_kind_idx\` ON \`events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`events_listing_idx\` ON \`events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`events_city_idx\` ON \`events\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`events_image_idx\` ON \`events\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`events__status_idx\` ON \`events\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new__events_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_date\` text,
  	\`version_kind_id\` integer,
  	\`version_venue_type\` text DEFAULT 'listing',
  	\`version_listing_id\` integer,
  	\`version_hood\` text,
  	\`version_city_id\` integer,
  	\`version_start_time\` text,
  	\`version_end_time\` text,
  	\`version_star\` integer DEFAULT false,
  	\`version_going\` numeric DEFAULT 0,
  	\`version_image_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new__events_v\`("id", "parent_id", "version_slug", "version_date", "version_kind_id", "version_venue_type", "version_listing_id", "version_hood", "version_city_id", "version_start_time", "version_end_time", "version_star", "version_going", "version_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest") SELECT "id", "parent_id", "version_slug", "version_date", "version_kind_id", "version_venue_type", "version_listing_id", "version_hood", "version_city_id", "version_start_time", "version_end_time", "version_star", "version_going", "version_image_id", "version_updated_at", "version_created_at", "version__status", "created_at", "updated_at", "snapshot", "published_locale", "latest" FROM \`_events_v\`;`)
  await db.run(sql`DROP TABLE \`_events_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__events_v\` RENAME TO \`_events_v\`;`)
  await db.run(sql`CREATE INDEX \`_events_v_parent_idx\` ON \`_events_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_slug_idx\` ON \`_events_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_kind_idx\` ON \`_events_v\` (\`version_kind_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_listing_idx\` ON \`_events_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_city_idx\` ON \`_events_v\` (\`version_city_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_image_idx\` ON \`_events_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_updated_at_idx\` ON \`_events_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_created_at_idx\` ON \`_events_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version__status_idx\` ON \`_events_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_created_at_idx\` ON \`_events_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_updated_at_idx\` ON \`_events_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_snapshot_idx\` ON \`_events_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_published_locale_idx\` ON \`_events_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_latest_idx\` ON \`_events_v\` (\`latest\`);`)
}
