import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { LibsqlDialect } from '@libsql/kysely-libsql'

/**
 * Member sign-in — Google only, via Better Auth. See MEMBERS.md.
 *
 * This is NOT Payload auth. Payload's `users` collection is the admin login and
 * everyone in it gets the admin panel; members must never land there. Better
 * Auth owns member identity, and the member's saved lists live in Payload's
 * `members` collection keyed by the Better Auth user id (src/lib/members.ts).
 *
 * Its tables live in their own SQLite file, not in content.db. Dev runs Payload
 * in push mode, which reconciles content.db against the collection config and
 * could offer to drop tables it did not declare — and member identity is the
 * one thing on this site that cannot be re-seeded.
 */
export function createAuth<P extends BetterAuthPlugin[] = []>(extraPlugins: P = [] as unknown as P) {
  return betterAuth({
    database: {
      dialect: new LibsqlDialect({ url: process.env.AUTH_DATABASE_URL || 'file:./auth.db' }),
      type: 'sqlite',
    },
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        // A shared family phone is exactly where silently reusing whichever
        // Google account is already signed in goes wrong.
        prompt: 'select_account',
      },
    },
    account: {
      // Google's tokens are kept only because Better Auth stores them with the
      // account link; nothing here calls Google with them. Encrypted at rest so
      // a copied auth.db does not hand them over.
      encryptOAuthTokens: true,
    },
    advanced: {
      ipAddress: {
        // Used for rate limiting and the sessions' recorded IP. The default,
        // x-forwarded-for, arrives here as "client, cloudflare" and Better
        // Auth rightly refuses to pick one — which left every visitor in a
        // single shared rate-limit bucket. Cloudflare sits in front of the
        // site and sends the visitor alone in cf-connecting-ip; x-real-ip
        // covers a request that reaches Railway's own domain directly.
        ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip'],
      },
    },
    session: {
      // Every page reads the session (the saved badge syncs site-wide), so
      // cache it in a signed cookie rather than hit auth.db per request.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      deleteUser: {
        enabled: true,
        // Lazy import: the migrate script loads this file and has no business
        // booting Payload.
        afterDelete: async (user) => {
          const { deleteMember } = await import('./members')
          await deleteMember(user.id)
        },
      },
    },
    plugins: [...extraPlugins, nextCookies()],
  })
}

export const auth = createAuth()

export type Session = typeof auth.$Infer.Session
