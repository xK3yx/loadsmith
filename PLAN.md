# Loadsmith Plan

Nov 11, 2026 (updated Nov 12, 2026)

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
- **Rule tables as data.** The hand-made rules (modifier groups, weapon classes, thrown consumables, stack rules) live as version-tagged JSON in `src/data/rules/`, not in code. Each entry can carry `since` and `until` save versions (for example, summon staffs use the magic modifier pool until 314 and the summon set from 315). The code only loads, validates (zod) and interprets them, so an update usually means editing data, not logic. Milestone 2 built these as TypeScript; Milestone 3 moves them to JSON.
- **Proof it works.** Golden tests: parse then serialize each fixture with no edits, and the output must match the original byte for byte. Then a second test applies a loadout and re-parses it.
- **Fixtures needed.** At least one Classic and one Journey save in 1.4.4.9 (save version 279) and in 1.4.5.8 (326). Make throwaway test characters for the public repo rather than committing personal characters.
- **License.** TEdit is MS-PL. A port is a derivative, so its source must stay MS-PL with the notice kept. The simplest option is MS-PL for the whole repo, credited to TEdit in the README.

## Loadout JSON

One versioned format, written by the AI, read and edited by the app, and saved and shared by players. Names are the English names from the official wiki. An item ID number is also accepted wherever a name is. Every section is optional, so a loadout can change only accessories, for example.

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
    { "item": "Zenith", "prefix": "Legendary", "favorite": true },
    { "item": "Terraprisma", "prefix": "Fabled" }
  ],
  "hotbar": ["Zenith", "Terraprisma", "Super Healing Potion", "Rod of Harmony"],
  "ammo": [{ "item": "Chlorophyte Bullet", "stack": 9999 }],
  "coins": { "platinum": 50 },
  "equipment": {
    "hook": "Lunar Hook",
    "mount": "Cosmic Car Key",
    "minecart": "Mechanical Cart",
    "pet": "Bone Rattle",
    "light_pet": "Fairy Bell"
  },
  "loadouts": {
    "2": {
      "class": "ranged",
      "armor": ["Vortex Helmet", "Vortex Breastplate", "Vortex Leggings"],
      "accessories": [{ "item": "Celestial Starboard", "prefix": "Menacing" }]
    },
    "3": {
      "class": "magic",
      "armor": ["Nebula Helmet", "Nebula Breastplate", "Nebula Leggings"],
      "accessories": [{ "item": "Celestial Starboard", "prefix": "Menacing" }]
    }
  },
  "items": [{ "item": "Super Healing Potion", "stack": 9999, "favorite": true }],
  "storage": {
    "piggy_bank": { "mode": "add", "items": [{ "item": "Greater Mana Potion", "stack": 9999 }] },
    "safe": { "mode": "replace", "items": [{ "item": "S.D.M.G.", "prefix": "Unreal" }] },
    "defenders_forge": { "items": [] },
    "void_vault": { "items": [] }
  },
  "character": {
    "max_life": 500,
    "max_mana": 200,
    "demon_heart": true,
    "minecart_upgrade": true,
    "journey_research": "full",
    "boosters": "all"
  },
  "unsupported": [
    { "recommendation": "Get the Peddler's Satchel", "reason": "World upgrade; can't be set from a character file" }
  ],
  "notes": "Why each pick was made. Shown to the player, never applied."
}
```

How the app applies it:

- **Armor and accessories** replace the equipped slots of loadout 1 in order. The accessory count must match the world's slots: 5 base, 6 with the Demon Heart (Expert and Master), 7 in Master. Anything replaced goes to the piggy bank, then the safe.
- **Loadouts** `"2"` and `"3"` set the armor and accessories of equipment loadouts 2 and 3 the same way. Terraria keeps the active loadout's gear in the main equipment slots and the other two separately, so the app maps loadout numbers to wherever each one is stored, whichever is active.
- **Weapons** go into the hotbar from slot 1. Whatever was there moves to free inventory slots.
- **Hotbar** optionally sets the order of hotbar slots 1 to 10. Each entry names an item placed by this loadout or already in the inventory; anything displaced moves to free inventory slots.
- **Favorites.** `"favorite": true` on any inventory, hotbar, ammo or item entry marks that slot as favorited.
- **Ammo and coins** fill the 4 ammo slots and the 4 coin slots. Coins are given per type (`platinum`, `gold`, `silver`, `copper`) and follow the coin stack limits.
- **Equipment** sets the hook, mount, minecart, pet and light pet slots. Replaced items go to storage like replaced armor.
- **Items** fill free inventory slots, then the banks. If everything is full, the app stops and says so instead of dropping anything.
- **Storage** stocks the piggy bank, safe, Defender's Forge and Void Vault. Each has a `mode`:
  - `"add"` (the default) fills empty slots only and never deletes anything.
  - `"replace"` clears that space first. Every removed item is listed in the preview before download.
- **Character** sets player stats and flags:
  - `max_life` (capped at 500) and `max_mana` (capped at 200). Higher values block the download.
  - `demon_heart` sets the extra accessory slot flag. It only does anything in Expert and Master worlds.
  - `minecart_upgrade` applies the Minecart Upgrade Kit.
  - `journey_research: "full"` researches every item. Journey characters only; it blocks on a Classic character.
  - `boosters` is `"all"` or a list (vital_crystal, aegis_fruit, arcane_crystal, galaxy_pearl, gummy_worm, ambrosia, artisan_loaf, torch_god).
  - Any other key that names a player flag the format layer knows (for example `used_galaxy_pearl` or `unlocked_biome_torches`) is applied too. New boosters added by a TEdit sync and a format update work without a schema change. Unknown keys block the download, with "did you mean" suggestions.
- **Unsupported** is a list of recommendations Loadsmith can't apply, each with a reason. Nothing in it is applied; the preview shows it to the player as things to do in-game.

### What a character file can't change

Some things live in the world file, not the character file, so Loadsmith can't change them: bosses defeated, NPC upgrades and other world progress, the Peddler's Satchel, and the world's difficulty. The AI is told to put recommendations like these in `unsupported` instead of the loadout.

## The AI prompt

The prompt is a template in the repo (`prompt/loadout-prompt.md`). The app fills in the player's choices and the schema, and the player copies the result. It tells the AI to:

1. Search the web for the latest PC version of Terraria and the current best-in-slot gear for the chosen class, preferring terraria.wiki.gg, before answering.
2. Use exact English item and modifier names as written on the wiki.
3. Pick only modifiers that exist for that item type (accessory, melee, ranged, magic, summon).
4. Fill exactly the number of accessory slots the player has.
5. Fill every section of `loadsmith/1`: armor, accessories, weapons, hotbar order and favorites, ammo, coins, equipment (hook, mount, minecart, pet, light pet), loadouts 2 and 3, items, storage (piggy bank, safe, Defender's Forge, Void Vault, with a mode for each) and character (max life and mana, Demon Heart, Minecart Upgrade Kit, boosters, and full research for Journey characters only).
6. Put anything it recommends that a character file can't hold (bosses, NPC upgrades, the Peddler's Satchel, world difficulty) in `unsupported`, with a reason.
7. Return one JSON code block in the `loadsmith/1` format, with reasoning only in `notes`.
8. Say in `notes` which version it researched, so the app can warn if that's older than the save.

The class choice is melee, ranged, magic, summon or **all-rounder**. All-rounder fills loadouts 1, 2 and 3 with three different class builds and stocks storage with weapons, ammo and consumables for all three.

Players without a search-enabled AI still get a usable loadout, but older. The version check in step 8 is what catches that.

## Caveats and how we handle them

The app never trusts the AI or the data blindly. Anything that could break a save is blocked, and anything only suboptimal gets a warning.

| Risk | What goes wrong | Handling |
| --- | --- | --- |
| Invented or misspelled names | AI writes "Celestial Shield" | Check against items.json, suggest the closest match, block download until fixed |
| Wrong modifier for the item | Legendary on a gun | TEdit data has no weapon class. Keep a small hand-made class map for endgame weapons; warn (don't block) for unmapped items |
| Modifier newer than the save | Fabled (1.4.5) in a 1.4.4.9 save | Block. Prefix IDs 85 and up are 1.4.5-only, so they need a 1.4.5 save version |
| Item newer than the save | A 1.4.5 item in a 1.4.4.9 save | Block, using per-version item ID limits |
| Bad stack sizes | TEdit lists 9,999 for almost every item, Zenith included | Loadsmith's own rule, not TEdit's maxStackSize or rackable flag: 1 for armor, accessories, mounts and weapons in the class table; 100 for copper, silver and gold coins and 9,999 for platinum (confirmed by real saves); 9,999 for food, placeables, potions, ammo and consumable thrown weapons; anything else up to 9,999 with a warning. A real-save test checks the rule never rejects a stack the game itself saved |
| More accessories than slots | 7th slot does nothing outside Master worlds | Ask world difficulty up front, warn on mismatch |
| Corrupted save | Character won't load | Golden round-trip tests; download as a new file, never overwrite; tell players to keep a backup |
| Unknown newer save version | Terraria 1.4.5.9 ships | Read-only view and a clear "not supported yet" message; a weekly GitHub Action checks TEdit's versions.json and opens an issue |
| Steam Cloud characters | Player can't find the file | Instructions for the local Players folder and the Steam Cloud folder |
| tModLoader characters | Modded data lives in a separate .tplr | Out of scope for v1; say so on the page |
| Multiplayer | Servers with server-side characters ignore local files | Note that it's for single-player and friends' worlds |
| Pasted JSON | Malformed or malicious input | Parse with zod only, never execute anything |
| Branding | Looking official | "Not affiliated with Re-Logic"; no game sprites or logos, item names only |
| World-level advice | AI recommends defeating a boss or buying the Peddler's Satchel | Can't be applied from a character file; the AI lists it in `unsupported` and the preview shows it |
| Game updates | New items, modifiers, boosters or renames break assumptions | Rule tables are version-tagged data, the character section accepts any flag the format knows, and the checklist below runs after each update |

## Build plan for Claude Code

Build in this order. Each milestone ends with passing tests, so a broken save format is caught before any UI exists.

1. **Format core.** Port TEdit's `PlayerFile.cs`, `PlayerCharacter.cs`, `PlayerItem.cs` and `PlayerConstants.cs` to `src/format/`, plus Web Crypto encrypt/decrypt. Done when every fixture round-trips byte for byte in Vitest.
2. **Game data.** `npm run sync-data` pulls TEdit's JSON into `src/data/`. Add name lookup, fuzzy matching, per-version item and prefix limits, and the weapon class map.
3. **Loadout engine.** zod schema for the full `loadsmith/1` (every section above, including storage modes, loadouts 2 and 3, equipment, ammo and coins, hotbar and favorites, character and `unsupported`), a validator that returns errors and warnings, and `applyLoadout(character, loadout)` that also returns a preview of every change and every removed item. Move the Milestone 2 rule tables to version-tagged JSON. Test it on every fixture.
4. **UI.** The four screens: load, prompt builder, paste and edit table, preview and download. The preview lists replaced and removed items and the `unsupported` recommendations. Everything stays in the browser.
5. **Prompt and examples.** `prompt/loadout-prompt.md` asking for every section, plus example loadouts in `examples/` for each class and for all-rounder in 1.4.5.8, checked by the validator in CI.
6. **Ship.** GitHub Actions for tests and Pages deploy, the weekly version-check workflow, README with a credit to TEdit, MS-PL license, and the not-affiliated note.

Work one milestone at a time: plan it, show the plan for review, then build.

## After each Terraria update

1. Run `npm run sync-data -- --ref master` and review the diff in `src/data/tedit/`. Raise the supported version range if there's a new save version.
2. Re-save the test characters in the new version: the throwaway fixtures in `tests/fixtures/`, plus local saves in `tests/local/`.
3. Run `npm test`, including the golden round trips and the real-save tests. If a rule rejects anything the game itself saved, fix the rule table, not the test.
4. Update the rule tables for anything new: modifier groups and the per-version modifier limit, weapon classes for new endgame weapons, thrown consumables, and pre-update names for renamed items.
5. Fill the gaps that example loadouts and players list under `unsupported`, where the character file can hold them.
6. Regenerate the example loadouts and check the prompt still produces valid `loadsmith/1`.

## Open questions

- [x] **Name and repo.** Decided: Loadsmith, repo xK3yx/loadsmith, schema loadsmith/1.
- [ ] **Fixtures.** Throwaway Classic and Journey characters, each saved once in 1.4.4.9 and once in 1.4.5.8. This needs a 1.4.4.9 install, for example through Steam's beta branches if it's offered.
- [ ] **Modifier checking.** Hand-made class map for endgame weapons (planned), or use the wiki's per-item modifier lists? The wiki is CC BY-NC-SA, which fits a free project but mixes licenses in the repo.
- [ ] **Character creation.** Patch existing characters only (planned for v1), or also start from a bundled blank character later?
- [ ] **Full Journey research.** The save stores each researched item's TEdit key with the count it needs, and the counts vary from 1 to 400 by item. TEdit's data has no table of those counts. Possible sources: a fully researched throwaway Journey character, or a data file outside TEdit (check its license).

## Sources

- [TEdit repository (MS-PL)](https://github.com/TEdit/Terraria-Map-Editor): `PlayerFile.cs`, `Data/items.json`, `Data/prefixes.json`, `Data/versions.json`, checked 11 Nov 2026
- [MS-PL license text](https://opensource.org/licenses/MS-PL)
- [1.4.5.0 changelog (Terraria Wiki)](https://terraria.wiki.gg/wiki/1.4.5.0)
- [1.4.5 summon modifiers (PCGamesN)](https://www.pcgamesn.com/terraria/1-4-5-update-summoner-weapon-reforge)
- [Terrasavr](https://yal.cc/r/terrasavr/), the existing browser editor this improves on
