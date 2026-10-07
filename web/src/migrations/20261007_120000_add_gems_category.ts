import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-sqlite'

/**
 * Data only, no schema: the `gems` category, LOCAL GEMS / JOYAS LOCALES.
 *
 * Categories come from the seed (`EXTRA_CATS` in `seed/index.ts`), and a
 * database that has already been seeded (production) is not re-seeded on
 * deploy, so without this the row would only exist after someone ran
 * `pnpm seed` from Railway's shell. The seed's upsert keys on the slug, so a
 * later seed finds this row and keeps it.
 *
 * Plain SQL, not payload.create: on a fresh database (CI, the Docker build) a
 * Payload write selects every column the CURRENT config declares, which later
 * migrations may not have added yet.
 *
 * Safe to run on any database, and a re-run is a no-op: each insert checks for
 * the row first. `order` goes after the existing rows.
 */
export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // The MAX sits in a subquery: an aggregate SELECT returns a row even when its
  // WHERE matches nothing, so `SELECT …, MAX(order) FROM categories WHERE NOT
  // EXISTS (…)` would insert a duplicate on a re-run.
  await db.run(sql`
    INSERT INTO \`categories\` (\`slug\`, \`order\`)
    SELECT 'gems', (SELECT COALESCE(MAX(\`order\`), -1) + 1 FROM \`categories\`)
    WHERE NOT EXISTS (SELECT 1 FROM \`categories\` WHERE \`slug\` = 'gems');
  `)
  for (const [locale, label] of [
    ['en', 'LOCAL GEMS'],
    ['es', 'JOYAS LOCALES'],
  ] as const) {
    await db.run(sql`
      INSERT INTO \`categories_locales\` (\`label\`, \`_locale\`, \`_parent_id\`)
      SELECT ${label}, ${locale}, \`id\` FROM \`categories\`
      WHERE \`slug\` = 'gems'
        AND NOT EXISTS (
          SELECT 1 FROM \`categories_locales\` l
          JOIN \`categories\` c ON c.\`id\` = l.\`_parent_id\`
          WHERE c.\`slug\` = 'gems' AND l.\`_locale\` = ${locale}
        );
    `)
  }
  payload.logger.info('[migrate] gems category: present')
}

/**
 * Removes the row only while nothing points at it, for the same reason
 * `pruneCategories` refuses: a listing or request in the category means the
 * removal is wrong. The locales go with it (ON DELETE cascade).
 */
export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  const used = (await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM \`listings\` WHERE \`category_id\` = c.\`id\`) +
      (SELECT COUNT(*) FROM \`listing_requests\` WHERE \`category_id\` = c.\`id\`) AS n
    FROM \`categories\` c WHERE c.\`slug\` = 'gems';
  `)) as { n: number }[]
  if (used[0] && Number(used[0].n) > 0) {
    throw new Error('[migrate] gems category is still in use; reassign those records first')
  }
  await db.run(sql`DELETE FROM \`categories\` WHERE \`slug\` = 'gems';`)
  payload.logger.info('[migrate] gems category: removed')
}
