'use client'

import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'

/** Same-origin client for the endpoints in app/api/auth. */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] })
