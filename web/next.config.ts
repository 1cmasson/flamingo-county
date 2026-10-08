import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Required by the Dockerfile: `next build` then emits `.next/standalone` with
  // a self-contained server.js and only the traced node_modules, which is what
  // the runtime stage copies. Without it the image builds and then fails at
  // `node server.js` because that file is never produced.
  output: 'standalone',
  // Development logs every request line, query string included. The civic
  // API and the MCP server take addresses in the query, and nothing about
  // what someone looks up is written anywhere (docs/civic-api-privacy.md).
  // Production logs no requests at all.
  logging: {
    incomingRequests: { ignore: [/\/api\/civic\//, /^\/mcp/, /\/api\/address\//] },
  },
  // The event card's fonts and mascots (lib/eventCard.tsx) are read from disk
  // at request time, by the card route and by any route whose publish runs the
  // social auto-draft (the admin, the REST API, the Telegram webhook), so they
  // go into every route's trace. The Dockerfile also copies `src/` whole.
  outputFileTracingIncludes: {
    '/**': ['./src/assets/og/**/*'],
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
      // Art that ships with the repo rather than through the CMS — the AI
      // receptionist bust is a 1.2MB PNG drawn into a ~190px box.
      {
        pathname: '/assets/**',
      },
    ],
  },
  // IndexNow ownership file: /<key>.txt has to live at the site root, where a
  // static file or a [key].txt segment can't be told apart from other .txt files.
  async rewrites() {
    return [{ source: '/:key([a-f0-9]{32}).txt', destination: '/indexnow/:key' }]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
