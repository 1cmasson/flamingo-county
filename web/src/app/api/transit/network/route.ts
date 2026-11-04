import { NextResponse } from 'next/server'
import { countyNetwork } from '../../../../lib/busNetwork'

/**
 * The county routes as the trip planner needs them (lib/busNetwork.ts). The
 * planner runs in the browser, so the visitor's location never comes here.
 */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(countyNetwork(), {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}
