import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every spec that calls getPayload opens its own connection to the same
    // SQLite file, and SQLite takes one writer at a time — run in parallel they
    // race on startup and the loser dies with SQLITE_BUSY. Serial costs a
    // second or two across a suite this size.
    fileParallelism: false,
  },
})
