import { ImageResponse } from 'next/og'
import sharp from 'sharp'

/**
 * Draws a `next/og` card to PNG bytes. Every generated card (events, seasons,
 * free rides) goes through here, never through `new ImageResponse` directly.
 *
 * WHY. `next/og` lays the card out as SVG (Satori) and, when sharp is
 * installed, turns that SVG into PNG with `sharp(svg).png()`. Next's image
 * optimizer, the first time anything asks `/_next/image` for a picture, calls
 * `sharp.block({ operation: ['VipsForeignLoad'] })` and unblocks only the
 * raster loaders (JPEG, PNG, WebP, GIF, TIFF, HEIF). Blocking is libvips
 * state, so it holds for the whole process: from then on every card failed
 * with "Input buffer contains unsupported image format" until the server
 * restarted. That was the production outage of 2026-10-07 (and the scattered
 * failures before it).
 *
 * So each draw unblocks the one loader it needs, the SVG-from-memory loader,
 * and the last draw to finish blocks it again, leaving Next's hardening of
 * `/_next/image` as Next set it. If Next's first block lands in the middle of
 * a draw, the draw is retried once.
 *
 * This only works because the app and `next/og` use the same sharp, and so
 * the same libvips: package.json pins sharp to the version Next depends on
 * (tests/int/og-image.int.spec.ts checks the lockfile holds exactly one).
 */
const SVG_LOADER = { operation: ['VipsForeignLoadSvgBuffer'] }

let drawing = 0

export async function renderOgPng(...args: ConstructorParameters<typeof ImageResponse>): Promise<ArrayBuffer> {
  drawing++
  try {
    sharp.unblock(SVG_LOADER)
    try {
      return await new ImageResponse(...args).arrayBuffer()
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('unsupported image format')) throw err
      sharp.unblock(SVG_LOADER)
      return await new ImageResponse(...args).arrayBuffer()
    }
  } finally {
    drawing--
    if (drawing === 0) sharp.block(SVG_LOADER)
  }
}
