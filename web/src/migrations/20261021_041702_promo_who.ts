import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`partners_staff\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`pin\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`partners\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`partners_staff_order_idx\` ON \`partners_staff\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`partners_staff_parent_id_idx\` ON \`partners_staff\` (\`_parent_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_partners\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`listing_id\` integer NOT NULL,
  	\`staff_pin\` text,
  	\`dashboard_key\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_partners\`("id", "name", "listing_id", "staff_pin", "dashboard_key", "notes", "updated_at", "created_at") SELECT "id", "name", "listing_id", "staff_pin", "dashboard_key", "notes", "updated_at", "created_at" FROM \`partners\`;`)
  await db.run(sql`DROP TABLE \`partners\`;`)
  await db.run(sql`ALTER TABLE \`__new_partners\` RENAME TO \`partners\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_listing_idx\` ON \`partners\` (\`listing_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_dashboard_key_idx\` ON \`partners\` (\`dashboard_key\`);`)
  await db.run(sql`CREATE INDEX \`partners_updated_at_idx\` ON \`partners\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`partners_created_at_idx\` ON \`partners\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`promotions\` ADD \`claim_by\` text DEFAULT 'web';`)
  await db.run(sql`ALTER TABLE \`_promotions_v\` ADD \`version_claim_by\` text DEFAULT 'web';`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` ADD \`channel\` text DEFAULT 'web';`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` ADD \`phone\` text;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` ADD \`whatsapp_name\` text;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` ADD \`redeemed_by\` text;`)
  await db.run(sql`CREATE INDEX \`promo_coupons_phone_idx\` ON \`promo_coupons\` (\`phone\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`promotion_phone_idx\` ON \`promo_coupons\` (\`promotion_id\`,\`phone\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`partners_staff\`;`)
  await db.run(sql`DROP INDEX \`promo_coupons_phone_idx\`;`)
  await db.run(sql`DROP INDEX \`promotion_phone_idx\`;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` DROP COLUMN \`channel\`;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` DROP COLUMN \`phone\`;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` DROP COLUMN \`whatsapp_name\`;`)
  await db.run(sql`ALTER TABLE \`promo_coupons\` DROP COLUMN \`redeemed_by\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_partners\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`listing_id\` integer NOT NULL,
  	\`staff_pin\` text NOT NULL,
  	\`dashboard_key\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_partners\`("id", "name", "listing_id", "staff_pin", "dashboard_key", "notes", "updated_at", "created_at") SELECT "id", "name", "listing_id", "staff_pin", "dashboard_key", "notes", "updated_at", "created_at" FROM \`partners\`;`)
  await db.run(sql`DROP TABLE \`partners\`;`)
  await db.run(sql`ALTER TABLE \`__new_partners\` RENAME TO \`partners\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_listing_idx\` ON \`partners\` (\`listing_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_dashboard_key_idx\` ON \`partners\` (\`dashboard_key\`);`)
  await db.run(sql`CREATE INDEX \`partners_updated_at_idx\` ON \`partners\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`partners_created_at_idx\` ON \`partners\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`promotions\` DROP COLUMN \`claim_by\`;`)
  await db.run(sql`ALTER TABLE \`_promotions_v\` DROP COLUMN \`version_claim_by\`;`)
}
