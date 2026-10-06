import { betterAuth, type BetterAuthPlugin } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { LibsqlDialect } from '@libsql/kysely-libsql'
import { langFromReferer, sendSignInCode } from './signInEmail'

/**
 * Member sign-in via Better Auth — Google, or a code emailed to you (for the
 * in-app browsers Google refuses). See MEMBERS.md.
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
      accountLinking: {
        // One person, one account, whichever way they sign in. A code proves
        // the inbox and Google vouches for its addresses, so signing in with
        // Google after an emailed code (or the other way round) lands in the
        // same account when the address matches.
        trustedProviders: ['google'],
      },
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
    databaseHooks: {
      user: {
        create: {
          // Tell the owner someone joined. Lazy import for the same reason as
          // afterDelete below, and never throws: a failed ping must not fail a sign-up.
          after: async (user) => {
            try {
              const { announceMember } = await import('./members')
              await announceMember(user)
            } catch (err) {
              console.error('[auth] new-member ping failed', err)
            }
          },
        },
      },
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
    plugins: [
      ...extraPlugins,
      emailOTP({
        // Long enough to switch from Instagram to the mail app and back.
        expiresIn: 10 * 60,
        // Codes are live credentials; auth.db only ever sees their hash.
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp }, ctx) {
          await sendSignInCode(email, otp, langFromReferer(ctx?.request?.headers.get('referer')))
        },
      }),
      nextCookies(),
    ],
  })
}

export const auth = createAuth()

export type Session = typeof auth.$Infer.Session
