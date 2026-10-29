import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

// hq-email-approvals.sendAt: an email Claude files with a send time is scheduled by the owner's tap, not sent.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_email_approvals\` ADD \`send_at\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_email_approvals\` DROP COLUMN \`send_at\`;`)
}
