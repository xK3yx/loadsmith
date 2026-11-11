# Loadsmith Plan

Nov 11, 2026 (updated Nov 12, 2026)

Loadsmith is a free, browser-only web app for Terraria: a player drops in their character file, pastes a JSON loadout that any flagship AI wrote from our prompt, edits it, and downloads the upgraded character. It runs entirely in the browser, needs no AI backend, and supports PC saves from 1.4.4.9 up to 1.4.5.8.

## How it works

A player goes from "best character for this update" to a finished file in about a minute, and their file never leaves their computer.

1. **Load.** Drop a .plr file in. The app decrypts it and shows the character: name, mode (Classic or Journey), save version, current gear. A save older than the newest supported version gets the "load and save it once in-game first" message before anything else (see Save format).
2. **Get the prompt.** Pick a class, a goal (bosses or general), Classic or Journey, and world difficulty (this sets the accessory slot count). Click Copy prompt, paste it into ChatGPT, Claude or Gemini, and copy back the JSON it writes.
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
- **Stay mappable to TEdit.** Keep `src/format/` structured line for line like TEdit's player code: same functions, same order, same version checks, with Loadsmith's changes marked in comments. A change to TEdit's code then maps directly onto ours.
- **Format doc.** `docs/save-format.md` describes the `.plr` format as we understand it (encryption, header, every field with the save versions that have it), so the project doesn't depend on TEdit continuing to exist.
- **Encryption.** AES-128-CBC. Key and IV are both the UTF-16LE bytes of `h3y_gUyZ`, with PKCS7 padding.
- **Game data.** Copy `items.json`, `prefixes.json` and `versions.json` from TEdit's `src/TEdit.Terraria/Data/` with a `npm run sync-data` script. Rerun it after each Terraria update.
- **Renamed items.** The sync compares item names between the old and new data. When an item ID keeps its key but changes its name (as 1.4.5 did with Flairon to Flairoon), the old name is kept automatically as an alias for saves older than the rename.
- **Rule tables as data.** The hand-made rules (modifier groups, weapon classes, thrown consumables, stack rules, research amounts, best modifiers) live as version-tagged JSON in `src/data/rules/`, not in code. Each entry can carry `since` and `until` save versions (for example, summon staffs use the magic modifier pool until 314 and the summon set from 315). The code only loads, validates (zod) and interprets them, so an update usually means editing data, not logic. Milestone 2 built these as TypeScript; Milestone 3 moves them to JSON. A modifier that exists in the synced data but has no rule in our tables yet is a warning, not a block.
- **Journey research amounts.** Full research needs the count each item requires (1 to 400 or more, by item), and TEdit's data doesn't have it. The source is the Terraria Wiki's research amounts, pulled from the wiki's Cargo API by `npm run sync-research` (development time only) into `src/data/rules/research.json`, credited to the wiki. Items the wiki leaves blank (work benches, Spectre Bar) and two name mismatches are in the hand-made `research-overrides.json`, taken from a fully researched Journey save. Loadsmith writes exactly the required count, never more. A test checks that every fully researched entry in the real Journey saves matches the table: 5,362 of 5,389 entries are equal, none are below it, and the one known difference is Life Crystal (saves store 13, the wiki says 10).
- **Research is unverified.** Until an in-game check confirms the counts, full research is marked unverified in code (`RESEARCH_UNVERIFIED` in `src/data/research.ts`) and the preview warns the player. The check: load the research test save in `tests/local/manual/` (a copy of a 1.4.5.8 Journey save, never committed; the automated tests skip `manual/`), where Starcrash (1), Fallen Star Block (100), Jungle Juice (30) and Swarm Grenade (1) are set to exactly the wiki's count and Shimmerfall Block to 150 (wiki: 100), and see which show as fully researched. Also check Life Crystal. Then clear the flag and the warning.
- **Proof it works.** Golden tests: parse then serialize each fixture with no edits, and the output must match the original byte for byte. Then a second test applies a loadout and re-parses it.
- **Fixtures needed.** Throwaway Classic and Journey characters committed to `tests/fixtures/`, never personal characters. At least one of each in 1.4.4.9 (save version 279) and in 1.4.5.8 (326). They carry some coins of every type (so the coin stack limits are checked against real saves), and at least one is played in 1.4.5 long enough to fill the crafting-refund or dialogue lists, which are empty in every save so far. Personal saves stay in the gitignored `tests/local/`.
- **Old saves.** Saves older than 1.4.4.9 get a message telling the player to load the character in the current game and save it once, which upgrades the file to a supported version.
- **Outdated but supported saves.** A save older than the newest supported version (for example a 1.4.4.9 save while 1.4.5.8 is supported) gets a clear message first: load the character in the latest Terraria and save and quit once before editing, so the game updates the file and newer items and modifiers become available. Editing still works, limited to what the save's version has. `outdatedSaveNotice()` in `src/data/versions.ts` writes the message; the validator puts it first in the warnings, and the UI shows it on load.
- **License.** TEdit is MS-PL. A port is a derivative, so its source must stay MS-PL with the notice kept. The simplest option is MS-PL for the whole repo, credited to TEdit in the README.

## Loadout JSON

One versioned format, written by the AI, read and edited by the app, and saved and shared by players. Names are the English names from the official wiki. An item ID number is also accepted wherever a name is. Every section is optional, so a loadout can change only accessories, for example.

```json
{
  "schema": "loadsmith/1",
  "game_version": "1.4.5.8",
  "class": "melee",
  "goal": "bosses",
  "target": { "mode": "classic", "world_difficulty": "master" },
  "best_modifiers": true,
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
  "items": [
    { "item": "Super Healing Potion", "stack": 9999, "favorite": true },
    { "item": "Rod of Harmony" }
  ],
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
- **Owned weapons and accessories are moved, not copied.** When the loadout names a weapon or accessory the player already owns (in the inventory, in storage, or just taken off by this loadout), that item moves into place and gets the loadout's modifier; a new one is added only if they don't own it. An owned copy that already has the named modifier is preferred, and with no modifier in the loadout the item keeps its own. The preview lists the move and any modifier change.
- **Hotbar** optionally sets the order of hotbar slots 1 to 10. Each entry names an item placed by this loadout or already in the inventory; anything displaced moves to free inventory slots.
- **Favorites.** `"favorite": true` on any inventory, hotbar, ammo or item entry marks that slot as favorited.
- **Ammo and coins** fill the 4 ammo slots and the 4 coin slots. Coins are given per type (`platinum`, `gold`, `silver`, `copper`) and follow the coin stack limits.
- **Equipment** sets the hook, mount, minecart, pet and light pet slots. Replaced items go to storage like replaced armor.
- **Items** fill free inventory slots, then the banks. If everything is full, the app stops and says so instead of dropping anything.
- **Storage** stocks the piggy bank, safe, Defender's Forge and Void Vault. Each has a `mode`:
  - `"add"` (the default) fills empty slots (topping up existing stacks first) and never deletes anything. If the chosen space is full, the rest goes to the next space with room, in piggy bank, safe, Defender's Forge, Void Vault order, skipping the chosen space and any space in `"replace"` mode; the preview lists every redirected item. It only blocks when every storage space is full.
  - `"replace"` clears that space first. Every removed item is listed in the preview before download.
- **Character** sets player stats and flags:
  - `max_life` (capped at 500) and `max_mana` (capped at 200). Higher values block the download.
  - `demon_heart` sets the extra accessory slot flag. It only does anything in Expert and Master worlds.
  - `minecart_upgrade` applies the Minecart Upgrade Kit.
  - `journey_research: "full"` researches every item that exists in the save's version, writing exactly the wiki's required count for each (never more; existing partial entries are raised, nothing is lowered). Journey characters only; it blocks on a Classic character. **Unverified:** the counts haven't been checked in-game yet, so the preview shows a warning until they are (see Save format).
  - `boosters` is `"all"` or a list (vital_crystal, aegis_fruit, arcane_crystal, galaxy_pearl, gummy_worm, ambrosia, artisan_loaf, torch_god).
  - Any other key that names a player flag the format layer knows (for example `used_galaxy_pearl` or `unlocked_biome_torches`) is applied too. New boosters added by a TEdit sync and a format update work without a schema change. Unknown keys block the download, with "did you mean" suggestions.
- **Best modifiers.** `"best_modifiers": true` (and a matching toggle in the UI) reforges every weapon and accessory the player owns, in the inventory, storage and all three loadouts, to the best modifier for its type and save version: Legendary for melee weapons and whips, Godly for melee weapons without size modifiers, Unreal for ranged, Mythical for magic, Ruthless for summon staffs before 1.4.5 and Fabled from 1.4.5, and Menacing for accessories. Game updates can reset or downgrade modifiers on items the AI never lists, which is why it covers everything. Modifiers the loadout names itself are kept. The picks are version-tagged data in `src/data/rules/best-prefixes.json`, and a test checks each is a modifier that type can roll. The preview lists every change; items with a modifier but an unknown weapon type are left alone and listed in a warning.
- **Goal** (`"bosses"` or `"general"`) records what the AI optimized for. It's informational and changes nothing when applied.
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
9. Cite a source in `notes` for each pick (a wiki page or guide URL), so the player can check the reasoning.
10. Match accessories to the weapon's ammo type. An ammo accessory only helps the ammo it names: the Phoenix Quiver (like the Magic Quiver and Molten Quiver) only helps arrows, so it's wasted on a gun build, and gun builds need bullet accessories such as the Sniper Scope or Recon Scope instead. The same goes for rocket and dart weapons. Every accessory must help a weapon in the same loadout.
11. Optimize for the player's goal, `"bosses"` (single-target damage, the default) or `"general"` (crowds, events and exploring), and write it in `goal`. The goal changes picks: for example Luminite Bullets (piercing, single-target damage) for bosses but Crystal Bullets (splitting shards for crowds) for general play, and likewise single-target versus area weapons and accessories.
12. Check the items and modifiers added or changed in the latest update, not just older guides. Many guides predate 1.4.5, so the AI must look at the latest version's patch notes or the wiki's update page and consider new gear (for example the 1.4.5 summon modifiers such as Fabled) before falling back on older best-in-slot lists.

The class choice is melee, ranged, magic, summon or **all-rounder**. All-rounder fills loadouts 1, 2 and 3 with three different class builds and stocks storage with weapons, ammo and consumables for all three.

The goal choice is **bosses** (the default) or **general**, picked next to the class in the prompt builder.

Players without a search-enabled AI still get a usable loadout, but older. The version check in step 8, the sources in step 9 and the latest-update check in step 12 are what catch that.

## Caveats and how we handle them

The app never trusts the AI or the data blindly. Anything that could break a save is blocked, and anything only suboptimal gets a warning.

| Risk | What goes wrong | Handling |
| --- | --- | --- |
| Invented or misspelled names | AI writes "Celestial Shield" | Check against items.json, suggest the closest match, block download until fixed |
| Wrong modifier for the item | Legendary on a gun | TEdit data has no weapon class. Keep a small hand-made class map for endgame weapons; warn (don't block) for unmapped items, and for modifiers that exist in the synced data but have no rule yet |
| Modifier newer than the save | Fabled (1.4.5) in a 1.4.4.9 save | Block. Prefix IDs 85 and up are 1.4.5-only, so they need a 1.4.5 save version |
| Item newer than the save | A 1.4.5 item in a 1.4.4.9 save | Block, using per-version item ID limits |
| Bad stack sizes | TEdit lists 9,999 for almost every item, Zenith included | Loadsmith's own rule, not TEdit's maxStackSize or rackable flag: 1 for armor, accessories, mounts and weapons in the class table; 100 for copper, silver and gold coins and 9,999 for platinum (confirmed by real saves); 9,999 for food, placeables, potions, ammo and consumable thrown weapons; 9,999 for a "safe stackable" category (treasure bags, crafting materials, medals such as Defender Medals); anything else up to 9,999 with a warning, so warnings only appear for truly unclear items. A real-save test checks the rule never rejects a stack the game itself saved |
| More accessories than slots | 7th slot does nothing outside Master worlds | Ask world difficulty up front, warn on mismatch |
| Corrupted save | Character won't load | Golden round-trip tests; download as a new file, never overwrite; tell players to keep a backup |
| Unknown newer save version | Terraria 1.4.5.9 ships | Read-only view and a clear "not supported yet" message; the weekly GitHub Action syncs TEdit's data, runs the tests and opens a pull request with the update |
| Older save version | A save from before 1.4.4.9 | Tell the player to load the character in the current game and save it once, then try again |
| Outdated supported save | A 1.4.4.9 save while 1.4.5.8 is supported | Editing works, but a message shown first asks the player to load and save the character once in the latest game, so newer items and modifiers are available |
| Downgraded modifiers | A game update rerolls modifiers on items the AI never lists | The `best_modifiers` option reforges everything owned to the best modifier for its type and save version, listing each change |
| Duplicate gear | AI lists a weapon the player already has | Owned weapons and accessories are moved into place with the new modifier instead of adding a copy |
| Full storage | The chosen storage space has no room | Add mode spills into the next space with room and the preview says where; it only blocks when every space is full |
| Mismatched accessories | Phoenix Quiver on a gun build | The prompt requires accessories to match the weapon's ammo type |
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
3. **Loadout engine.** zod schema for the full `loadsmith/1` (every section above, including storage modes, loadouts 2 and 3, equipment, ammo and coins, hotbar and favorites, character and `unsupported`), a validator that returns errors and warnings, and `applyLoadout(character, loadout)` that also returns a preview of every change and every removed item. Move the Milestone 2 rule tables to version-tagged JSON, add the "safe stackable" category and the research amounts table, make the sync keep renamed items' old names as aliases, and write `docs/save-format.md`. Test it on every fixture.
4. **UI.** The four screens: load, prompt builder, paste and edit table, preview and download. The preview lists replaced, moved, redirected, reforged and removed items and the `unsupported` recommendations. The prompt builder has the goal choice (bosses or general) and the edit screen has a "Best modifiers for everything" toggle that sets `best_modifiers`. Saves older than 1.4.4.9 get the "load and save it once in the current game" message, and supported saves older than the newest version get the "load and save it once in the latest game before editing" message first, with editing still allowed. Everything stays in the browser.
5. **Prompt and examples.** `prompt/loadout-prompt.md` asking for every section and following the prompt rules above (accessories matching the weapon's ammo type, the bosses or general goal, and checking the latest update's items), plus example loadouts in `examples/` for each class and for all-rounder in 1.4.5.8, checked by the validator in CI.
6. **Ship.** GitHub Actions for tests and Pages deploy, the weekly update workflow, README with a credit to TEdit, MS-PL license, and the not-affiliated note. The weekly workflow runs `npm run sync-data -- --ref master` and `npm test`, and when the data changed it opens a pull request with the updated data and the test results. The pull request also:
   - lists weapons added since the last sync that aren't in the weapon class table,
   - lists modifiers in the synced data with no rule in our tables yet,
   - shows items renamed since the last sync (already kept as aliases by the sync),
   - flags any change to TEdit's player save code (`src/TEdit.Terraria/Player/` and `CreativePowers.cs`) since the commit our port is based on, with the diff, so it can be ported to `src/format/`.

Work one milestone at a time: plan it, show the plan for review, then build.

## After each Terraria update

1. Run `npm run sync-data -- --ref master` (or review the weekly workflow's pull request) and review the diff in `src/data/tedit/`. Raise the supported version range if there's a new save version.
2. Check whether TEdit's player save code changed since the commit our port is based on. If it did, port the diff to `src/format/` (same structure, line for line) and update `docs/save-format.md`.
3. Re-save the test characters in the new version: the throwaway fixtures in `tests/fixtures/` (Classic and Journey, with coins of every type) and the local saves in `tests/local/`. Commit the new fixtures.
4. Run `npm test`, including the golden round trips and the real-save tests. If a rule rejects anything the game itself saved, fix the rule table, not the test.
5. Update the rule tables for anything new: modifier groups and the per-version modifier limit, weapon classes for new endgame weapons, thrown consumables and safe stackables, research amounts for new items, and the best modifier per type if new modifiers beat the current picks. Check the renamed items the sync kept as aliases.
6. Fill the gaps that example loadouts and players list under `unsupported`, where the character file can hold them.
7. Regenerate the example loadouts and check the prompt still produces valid `loadsmith/1`.

## Open questions

- [x] **Name and repo.** Decided: Loadsmith, repo xK3yx/loadsmith, schema loadsmith/1.
- [ ] **Fixtures.** Throwaway Classic and Journey characters, each saved once in 1.4.4.9 and once in 1.4.5.8, with coins of every type, and one played in 1.4.5 long enough to fill the crafting-refund or dialogue lists. This needs a 1.4.4.9 install, for example through Steam's beta branches if it's offered.
- [ ] **Modifier checking.** Hand-made class map for endgame weapons (planned), or use the wiki's per-item modifier lists? The wiki is CC BY-NC-SA, which fits a free project but mixes licenses in the repo.
- [ ] **Character creation.** Patch existing characters only (planned for v1), or also start from a bundled blank character later?
- [x] **Full Journey research.** Decided: research amounts come from the Terraria Wiki, stored as version-tagged JSON and checked against real Journey saves (see Save format). The amounts are game facts; the wiki is credited as the source.

## Sources

- [TEdit repository (MS-PL)](https://github.com/TEdit/Terraria-Map-Editor): `PlayerFile.cs`, `Data/items.json`, `Data/prefixes.json`, `Data/versions.json`, checked 11 Nov 2026
- [MS-PL license text](https://opensource.org/licenses/MS-PL)
- [1.4.5.0 changelog (Terraria Wiki)](https://terraria.wiki.gg/wiki/1.4.5.0)
- [Journey Mode research (Terraria Wiki)](https://terraria.wiki.gg/wiki/Journey_Mode#Research): per-item research amounts
- [1.4.5 summon modifiers (PCGamesN)](https://www.pcgamesn.com/terraria/1-4-5-update-summoner-weapon-reforge)
- [Terrasavr](https://yal.cc/r/terrasavr/), the existing browser editor this improves on
