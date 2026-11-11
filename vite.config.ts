import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/loadsmith/ on GitHub Pages.
  base: '/loadsmith/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
})
