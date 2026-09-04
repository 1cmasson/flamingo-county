import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`listings\` ADD \`logo_id\` integer REFERENCES media(id);`)
  await db.run(sql`CREATE INDEX \`listings_logo_idx\` ON \`listings\` (\`logo_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_listings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`city_id\` integer NOT NULL,
  	\`category_id\` integer NOT NULL,
  	\`hood\` text,
  	\`rating\` numeric,
  	\`reviews\` numeric,
  	\`publication_status\` text DEFAULT 'unsourced' NOT NULL,
  	\`member\` integer DEFAULT false,
  	\`detail_quote_by\` text,
  	\`detail_address\` text,
  	\`detail_phone\` text,
  	\`detail_site\` text,
  	\`detail_email\` text,
  	\`detail_instagram\` text,
  	\`detail_hours_confidence\` text,
  	\`research_established\` text,
  	\`research_established_note\` text,
  	\`research_legal_entity\` text,
  	\`research_source_file\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings\`("id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at") SELECT "id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at" FROM \`listings\`;`)
  await db.run(sql`DROP TABLE \`listings\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings\` RENAME TO \`listings\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_slug_idx\` ON \`listings\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`listings_city_idx\` ON \`listings\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_category_idx\` ON \`listings\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_updated_at_idx\` ON \`listings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`listings_created_at_idx\` ON \`listings\` (\`created_at\`);`)
}
