# Loadsmith Plan

Nov 11, 2026

Loadsmith is a free, browser-only web app for Terraria: a player drops in their character file, pastes a JSON loadout that any flagship AI wrote from our prompt, edits it, and downloads the upgraded character. It runs entirely in the browser, needs no AI backend, and supports PC saves from 1.4.4.9 up to 1.4.5.8.

## How it works

A player goes from "best character for this update" to a finished file in about a minute, and their file never leaves their computer.

1. **Load.** Drop a .plr file in. The app decrypts it and shows the character: name, mode (Classic or Journey), save version, current gear.
2. **Get the prompt.** Pick a class, Classic or Journey, and world difficulty (this sets the accessory slot count). Click Copy prompt, paste it into ChatGPT, Claude or Gemini, and copy back the JSON it writes.
3. **Paste and edit.** The app checks every item and modifier name, flags mistakes with "did you mean" fixes, and shows the loadout as an editable table with searchable dropdowns.
4. **Download.** A before/after preview, then download the new .plr, along with instructions for where to put it.

## Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where it runs | Static site, all in the browser | No server cost, no uploads, nothing to install |
| Stack | Vite + TypeScript + React, zod for JSON validation, Vitest for tests | Fast to build with Claude Code, easy to test |
| Encryption | Web Crypto AES-CBC (built into every browser) | Same scheme Terraria uses, PKCS7 padding included |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push to main | Free and tied to the repo |
| Platforms | PC saves only (Windows, Mac, Linux, Steam and GOG) | Mobile and console saves use different formats |
| Editing model | Patch an existing character, never build one from scratch | Keeps appearance, research and everything we don't touch |
| Write version | Write the file back in the version it was loaded as | Never invent fields a newer version expects |
| AI | A copyable prompt, no AI API | Free, works with any model, refreshes itself each update |
| License | MS-PL for the repo (see Save format) | Required by the TEdit code we port |

## Save format

Port TEdit's player file reader and writer to TypeScript. Don't extend the Python prototype: it patches fixed byte offsets that only work for 1.4.4.9.

- **Why TEdit.** [TEdit](https://github.com/TEdit/Terraria-Map-Editor) now has a full player editor. Its `src/TEdit.Terraria/Player/PlayerFile.cs` (about 1,000 lines) reads and writes every save version up to 326 (game 1.4.5.8), and it was updated on 10 Nov 2026.
- **Why offsets break.** 1.4.5 inserts new fields early in the file: a team byte (save version 283+), a reserved flag between the boosters (324+), favorite flags on armor and dye slots (322+), and crafting refunds and dialogue lists (300+, 310+). Everything after them shifts.
- **Approach.** Full parse into a typed `PlayerCharacter` object, edit the object, serialize the whole thing back. Every version check in `PlayerFile.cs` gets ported as-is.
- **Encryption.** AES-128-CBC. Key and IV are both the UTF-16LE bytes of `h3y_gUyZ`, with PKCS7 padding.
- **Game data.** Copy `items.json`, `prefixes.json` and `versions.json` from TEdit's `src/TEdit.Terraria/Data/` with a `npm run sync-data` script. Rerun it after each Terraria update.
- **Proof it works.** Golden tests: parse then serialize each fixture with no edits, and the output must match the original byte for byte. Then a second test applies a loadout and re-parses it.
- **Fixtures needed.** At least one Classic and one Journey save in 1.4.4.9 (save version 279) and in 1.4.5.8 (326). Make throwaway test characters for the public repo rather than committing personal characters.
- **License.** TEdit is MS-PL. A port is a derivative, so its source must stay MS-PL with the notice kept. The simplest option is MS-PL for the whole repo, credited to TEdit in the README.

## Loadout JSON

One versioned format, written by the AI, read and edited by the app, and saved and shared by players. Names are the English names from the official wiki. An item ID number is also accepted wherever a name is.

```json
{
  "schema": "loadsmith/1",
  "game_version": "1.4.5.8",
  "class": "melee",
  "target": { "mode": "classic", "world_difficulty": "master" },
  "armor": ["Solar Flare Helmet", "Solar Flare Breastplate", "Solar Flare Leggings"],
  "accessories": [
    { "item": "Celestial Starboard", "prefix": "Menacing" },
    { "item": "Soaring Insignia", "prefix": "Menacing" }
  ],
  "weapons": [
    { "item": "Zenith", "prefix": "Legendary" },
    { "item": "Terraprisma", "prefix": "Fabled" }
  ],
  "items": [{ "item": "Super Healing Potion", "stack": 9999 }],
  "boosters": "all",
  "notes": "Why each pick was made. Shown to the player, never applied."
}
```

How the app applies it:

- **Armor and accessories** replace the equipped slots in order. The accessory count must match the world's slots: 5 base, 6 with the Demon Heart (Expert and Master), 7 in Master. Anything replaced goes to the piggy bank, then the safe.
- **Weapons** go into the hotbar from slot 1. Whatever was there moves to free inventory slots.
- **Items** fill free inventory slots, then the banks. If everything is full, the app stops and says so instead of dropping anything.
- **Boosters** are `"all"` or a list (vital_crystal, aegis_fruit, arcane_crystal, galaxy_pearl, gummy_worm, ambrosia, artisan_loaf, torch_god).
- Every field is optional, so a loadout can change only accessories, for example.

## The AI prompt

The prompt is a template in the repo (`prompt/loadout-prompt.md`). The app fills in the player's choices and the schema, and the player copies the result. It tells the AI to:

1. Search the web for the latest PC version of Terraria and the current best-in-slot gear for the chosen class, preferring terraria.wiki.gg, before answering.
2. Use exact English item and modifier names as written on the wiki.
3. Pick only modifiers that exist for that item type (accessory, melee, ranged, magic, summon).
4. Fill exactly the number of accessory slots the player has.
5. Return one JSON code block in the `loadsmith/1` format, with reasoning only in `notes`.
6. Say in `notes` which version it researched, so the app can warn if that's older than the save.

Players without a search-enabled AI still get a usable loadout, but older. The version check in step 6 is what catches that.

## Caveats and how we handle them

The app never trusts the AI or the data blindly. Anything that could break a save is blocked, and anything only suboptimal gets a warning.

| Risk | What goes wrong | Handling |
| --- | --- | --- |
| Invented or misspelled names | AI writes "Celestial Shield" | Check against items.json, suggest the closest match, block download until fixed |
| Wrong modifier for the item | Legendary on a gun | TEdit data has no weapon class. Keep a small hand-made class map for endgame weapons; warn (don't block) for unmapped items |
| Modifier newer than the save | Fabled (1.4.5) in a 1.4.4.9 save | Block. Prefix IDs 85 and up are 1.4.5-only, so they need a 1.4.5 save version |
| Item newer than the save | A 1.4.5 item in a 1.4.4.9 save | Block, using per-version item ID limits |
| Bad stack sizes | TEdit lists Zenith as stacking to 9,999 | Force 1 for weapons, armor and accessories; trust maxStackSize only for consumables |
| More accessories than slots | 7th slot does nothing outside Master worlds | Ask world difficulty up front, warn on mismatch |
| Corrupted save | Character won't load | Golden round-trip tests; download as a new file, never overwrite; tell players to keep a backup |
| Unknown newer save version | Terraria 1.4.5.9 ships | Read-only view and a clear "not supported yet" message; a weekly GitHub Action checks TEdit's versions.json and opens an issue |
| Steam Cloud characters | Player can't find the file | Instructions for the local Players folder and the Steam Cloud folder |
| tModLoader characters | Modded data lives in a separate .tplr | Out of scope for v1; say so on the page |
| Multiplayer | Servers with server-side characters ignore local files | Note that it's for single-player and friends' worlds |
| Pasted JSON | Malformed or malicious input | Parse with zod only, never execute anything |
| Branding | Looking official | "Not affiliated with Re-Logic"; no game sprites or logos, item names only |

## Build plan for Claude Code

Build in this order. Each milestone ends with passing tests, so a broken save format is caught before any UI exists.

1. **Format core.** Port TEdit's `PlayerFile.cs`, `PlayerCharacter.cs`, `PlayerItem.cs` and `PlayerConstants.cs` to `src/format/`, plus Web Crypto encrypt/decrypt. Done when every fixture round-trips byte for byte in Vitest.
2. **Game data.** `npm run sync-data` pulls TEdit's JSON into `src/data/`. Add name lookup, fuzzy matching, per-version item and prefix limits, and the weapon class map.
3. **Loadout engine.** zod schema for `loadsmith/1`, a validator that returns errors and warnings, and `applyLoadout(character, loadout)`. Test it on every fixture.
4. **UI.** The four screens: load, prompt builder, paste and edit table, preview and download. Everything stays in the browser.
5. **Prompt and examples.** `prompt/loadout-prompt.md`, plus example loadouts in `examples/` for each class in 1.4.5.8, checked by the validator in CI.
6. **Ship.** GitHub Actions for tests and Pages deploy, the weekly version-check workflow, README with a credit to TEdit, MS-PL license, and the not-affiliated note.

Work one milestone at a time: plan it, show the plan for review, then build.

## Open questions

- [x] **Name and repo.** Decided: Loadsmith, repo xK3yx/loadsmith, schema loadsmith/1.
- [ ] **Fixtures.** Throwaway Classic and Journey characters, each saved once in 1.4.4.9 and once in 1.4.5.8. This needs a 1.4.4.9 install, for example through Steam's beta branches if it's offered.
- [ ] **Modifier checking.** Hand-made class map for endgame weapons (planned), or use the wiki's per-item modifier lists? The wiki is CC BY-NC-SA, which fits a free project but mixes licenses in the repo.
- [ ] **Character creation.** Patch existing characters only (planned for v1), or also start from a bundled blank character later?

## Sources

- [TEdit repository (MS-PL)](https://github.com/TEdit/Terraria-Map-Editor): `PlayerFile.cs`, `Data/items.json`, `Data/prefixes.json`, `Data/versions.json`, checked 11 Nov 2026
- [MS-PL license text](https://opensource.org/licenses/MS-PL)
- [1.4.5.0 changelog (Terraria Wiki)](https://terraria.wiki.gg/wiki/1.4.5.0)
- [1.4.5 summon modifiers (PCGamesN)](https://www.pcgamesn.com/terraria/1-4-5-update-summoner-weapon-reforge)
- [Terrasavr](https://yal.cc/r/terrasavr/), the existing browser editor this improves on
