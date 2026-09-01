import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `events.timeLabel` becomes localized.
 *
 * It held clock readings ('9PM-1AM') where the language does not matter, so it
 * was never localized. The first real event on the board has no settled time
 * and says so in words - 'Por confirmar' - which does.
 *
 * The column MOVES rather than copies: this drops `events.time_label` without
 * carrying its values into `events_locales`. That is safe only because no
 * deployed database has ever held an event - the 20 in `fc-data.js` are behind
 * `SEED_MOCK_CONTENT` and have never been seeded to Railway. Re-run `pnpm seed`
 * after migrating and every event is rewritten in both locales anyway.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events_locales\` ADD \`time_label\` text;`)
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`time_label\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`time_label\` text;`)
  await db.run(sql`ALTER TABLE \`events_locales\` DROP COLUMN \`time_label\`;`)
}
