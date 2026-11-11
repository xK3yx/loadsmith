# Loadsmith: notes for Claude Code

Read PLAN.md first. It is the source of truth for scope, decisions and milestone order.

## What this is

A static, browser-only web app that edits Terraria PC character saves (`.plr`) using a JSON loadout (schema `loadsmith/1`). No backend, no network calls with user data.

## Stack

Vite + React + TypeScript (strict), zod for validation, Vitest for tests. Deployed to GitHub Pages by GitHub Actions.

## Hard rules

- **Save format comes from TEdit.** Port `src/TEdit.Terraria/Player/` from https://github.com/TEdit/Terraria-Map-Editor into `src/format/`. Port every `version >= N` check as-is. Never patch fixed byte offsets.
- **Byte-for-byte round trip.** Parsing then serializing an unedited fixture must reproduce the original bytes exactly. This test must pass before any milestone is done.
- **Write back in the loaded version.** Never upgrade or downgrade a save's version.
- **Never trust input.** Pasted JSON is parsed with zod only and never executed. Unknown items, modifiers newer than the save version, or items newer than the save version block the download.
- **Encryption:** AES-128-CBC, key = IV = UTF-16LE bytes of `h3y_gUyZ`, PKCS7 padding, via Web Crypto.
- **Licensing:** files ported from TEdit keep a header crediting TEdit and MS-PL. Game data JSON comes from TEdit's `src/TEdit.Terraria/Data/` via `npm run sync-data`.
- **No game assets:** no sprites, textures or logos. Item names only.
- **No personal saves in git.** Only throwaway characters go in `tests/fixtures/`.

## Workflow

Work one milestone at a time. Plan each milestone, show the plan, then build. Finish with tests passing (`npm test`) and a short summary of what changed.
