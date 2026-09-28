'use client'

import { createAuthClient } from 'better-auth/react'

/** Same-origin client for the endpoints in app/api/auth. */
export const authClient = createAuthClient()
