import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '../../../../lib/auth'

/**
 * Better Auth's endpoints — sign-in, the Google callback, sign-out, session,
 * delete-user. It sits under /api so the language proxy leaves it alone (its
 * matcher skips `api`), and the static `auth` segment takes precedence over
 * Payload's `(payload)/api/[...slug]` catch-all.
 *
 * Google's authorised redirect URI is therefore
 * `<BETTER_AUTH_URL>/api/auth/callback/google`.
 */
export const { GET, POST } = toNextJsHandler(auth)
