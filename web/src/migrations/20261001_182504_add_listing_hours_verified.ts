import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`listings_detail_opening_hours_days\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` text NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`listings_detail_opening_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_opening_hours_days_order_idx\` ON \`listings_detail_opening_hours_days\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_opening_hours_days_parent_idx\` ON \`listings_detail_opening_hours_days\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_opening_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`opens\` text,
  	\`closes\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_opening_hours_order_idx\` ON \`listings_detail_opening_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_opening_hours_parent_id_idx\` ON \`listings_detail_opening_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_opening_hours_days\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_listings_v_version_detail_opening_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_opening_hours_days_order_idx\` ON \`_listings_v_version_detail_opening_hours_days\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_opening_hours_days_parent_idx\` ON \`_listings_v_version_detail_opening_hours_days\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_opening_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`opens\` text,
  	\`closes\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_opening_hours_order_idx\` ON \`_listings_v_version_detail_opening_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_opening_hours_parent_id_idx\` ON \`_listings_v_version_detail_opening_hours\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`listings\` ADD \`last_verified_at\` text;`)
  await db.run(sql`ALTER TABLE \`listings\` ADD \`verified_by\` text;`)
  await db.run(sql`ALTER TABLE \`listings\` ADD \`detail_hours_source\` text;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` ADD \`version_last_verified_at\` text;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` ADD \`version_verified_by\` text;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` ADD \`version_detail_hours_source\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`listings_detail_opening_hours_days\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_opening_hours\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_opening_hours_days\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_opening_hours\`;`)
  await db.run(sql`ALTER TABLE \`listings\` DROP COLUMN \`last_verified_at\`;`)
  await db.run(sql`ALTER TABLE \`listings\` DROP COLUMN \`verified_by\`;`)
  await db.run(sql`ALTER TABLE \`listings\` DROP COLUMN \`detail_hours_source\`;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` DROP COLUMN \`version_last_verified_at\`;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` DROP COLUMN \`version_verified_by\`;`)
  await db.run(sql`ALTER TABLE \`_listings_v\` DROP COLUMN \`version_detail_hours_source\`;`)
}
