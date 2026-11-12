import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Production builds get a Content Security Policy that blocks every network
 * request from the page (connect-src 'none'), so a character file can't be
 * sent anywhere even by mistake. Left out of dev, where Vite's live reload
 * needs a connection.
 */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

function contentSecurityPolicy(): Plugin {
  return {
    name: 'loadsmith-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/loadsmith/ on GitHub Pages.
  base: '/loadsmith/',
  plugins: [react(), contentSecurityPolicy()],
  // The game data (about 6,000 items and their research amounts) is bundled
  // so nothing is fetched at run time; it makes one ~1.2 MB (~260 KB gzipped) file.
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
