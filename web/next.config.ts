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
