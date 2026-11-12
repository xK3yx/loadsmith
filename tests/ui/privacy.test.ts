// Loadsmith must never send a character anywhere. These checks keep it that way:
// no network APIs in the app code, and a production CSP that blocks requests.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSP } from '../../vite.config.ts'

const SRC = join(import.meta.dirname, '..', '..', 'src')

function sources(): { file: string; text: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ file: f, text: readFileSync(join(SRC, f), 'utf8') }))
}

describe('privacy', () => {
  it('app code uses no network APIs', () => {
    const banned = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\s*\(\s*['"]https?:)/
    const hits = sources().filter((s) => banned.test(s.text)).map((s) => s.file)
    expect(hits).toEqual([])
  })

  it('production builds block every request', () => {
    expect(CSP).toContain("connect-src 'none'")
    expect(CSP).toContain("form-action 'none'")
    expect(CSP).not.toMatch(/https?:/)
  })
})
