import type { Payload } from 'payload'

/** The standing Facebook rule needs a photo or video and a flamingocounty.com link on every Facebook draft. */
export const FB_LINK = 'https://flamingocounty.com'
export const withFbLink = (caption: string): string => `${caption} ${FB_LINK}`

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

let n = 0

/** Creates a tiny hq-media photo and returns its id. Callers may delete it afterwards. */
export async function makeHqMedia(payload: Payload): Promise<number> {
  const doc = await payload.create({
    collection: 'hq-media',
    data: { note: 'TEST facebook rule' },
    file: { data: PNG, mimetype: 'image/png', name: `fb-test-${process.pid}-${Date.now()}-${n++}.png`, size: PNG.length },
    overrideAccess: true,
  })
  return doc.id as number
}
