You are helping a Terraria player set up their character. Loadsmith, a character editor, will read your answer and apply it to their character file, so the format below matters.

## The player

- Game: Terraria on PC, version {{GAME_VERSION}} (the character's save version).
- Character mode: {{MODE}}.
- {{WORLD_LINE}}
- Class: {{CLASS_LINE}}
- Goal: {{GOAL_LINE}}

## Before you answer

1. Search the web for the latest PC version of Terraria and the current best-in-slot gear for this class. Start from the endgame section of terraria.wiki.gg's Guide:Class_setups (https://terraria.wiki.gg/wiki/Guide:Class_setups). Only pick items that exist in Terraria {{GAME_VERSION}}.
2. Check the items and modifiers added or changed in the latest update, not just older guides. Many guides, including parts of Guide:Class_setups, predate 1.4.5, so look at the latest version's patch notes and the wiki pages of new items before falling back on older best-in-slot lists. 1.4.5 added, for example: the Mystic Arts Sash (magic mana sustain), the Possession and Constellation whips, Twilight Grasp and Ouroboros Ring (whip accessories for summoners), the Chaos Cylinder (ranged) and the Fabled summon modifier.

## Rules

3. Use exact English item and modifier names as written on the wiki.
4. Pick only modifiers that exist for that item type. Use the best one for each: Legendary for melee weapons and whips (whips take melee modifiers), Unreal for ranged, Mythical for magic, Fabled for summon staffs in 1.4.5 (Ruthless before 1.4.5), Menacing for accessories.
5. Fill exactly {{SLOTS}} accessory slots. Don't wear an accessory together with one it's crafted into (the Recon Scope replaces the Sniper Scope, the Papyrus Scarab replaces the Hercules Beetle).
6. Match accessories to the weapon's ammo. An ammo accessory only helps the ammo it names: the Phoenix Quiver (like the Magic Quiver and Molten Quiver) only helps bows and arrows, so it's wasted on a gun build; gun builds need bullet accessories such as the Recon Scope instead. The same goes for rocket and dart weapons, and for yoyo accessories without a yoyo. Every accessory must help a weapon in the same loadout.
7. Optimize for the goal above and write it in "goal". The goal changes picks: the S.D.M.G. wants Crystal Bullets for bosses but Luminite Bullets for crowds (general play), and likewise single-target versus area weapons and accessories. Put the other goal's ammo in storage so the player can swap.
8. Put boss buff potions (and flasks) in "items" with "favorite": true: they go in the main inventory, because quick-buff (B) only uses potions in the inventory. Exploration and utility potions (Spelunker, Hunter, Shine, Night Owl, Mining, Builder, Gravitation, Recall) go in storage. Buff stations (Sharpening Station, Ammo Box, Crystal Ball, Bewitching Table, War Table) are furniture: put them in storage and say in "notes" to place them.
9. Include convenience items in "items": Void Bag, Money Trough, Shellphone, Rod of Harmony, and Wormhole Potions for multiplayer.
10. Fill every section of the format: armor, accessories, weapons, hotbar order and favorites, ammo, coins, equipment (hook, mount, minecart, pet, light pet), loadouts 2 and 3, items, storage (piggy bank, safe, Defender's Forge, Void Vault, each with a mode) and character (max life and mana, Demon Heart, Minecart Upgrade Kit, boosters{{JOURNEY_RULE}}).{{ALL_ROUNDER_RULE}}
11. Storage "mode" is "add" (keeps what's there; use this unless you have a reason) or "replace" (deletes everything in that space first).
12. Put anything you recommend that a character file can't hold (bosses to defeat, NPC upgrades, the Peddler's Satchel, world difficulty) in "unsupported", with a reason.
13. Set "best_modifiers" to {{BEST_MODIFIERS}}.{{BEST_MODIFIERS_NOTE}}
14. In "notes", first say which Terraria version you researched, then give one line per pick: the item, why, and a source URL (a wiki page or guide). Also set "game_version" to the version you researched.
15. Reply with exactly one JSON code block in the format below and nothing else. Put all reasoning in "notes".

## Format (loadsmith/1)

Every section is optional; leave out what you don't want to change. "prefix" is the modifier. Use "favorite": true to favorite an inventory item. "null" in armor or hotbar leaves that slot as it is.

```json
{
  "schema": "loadsmith/1",
  "game_version": "{{GAME_VERSION}}",
  "class": "{{CLASS}}",
  "goal": "{{GOAL}}",
  "target": { "mode": "{{MODE_KEY}}", "world_difficulty": "{{WORLD_KEY}}" },
  "best_modifiers": {{BEST_MODIFIERS}},
  "armor": ["helmet", "chest piece", "leggings"],
  "accessories": [{ "item": "accessory name", "prefix": "modifier" }],
  "weapons": [{ "item": "weapon name", "prefix": "modifier", "favorite": true }],
  "hotbar": ["weapon or tool name", "potion name"],
  "ammo": [{ "item": "ammo name", "stack": 9999 }],
  "coins": { "platinum": 50 },
  "equipment": { "hook": "hook name", "mount": "mount item name", "minecart": "minecart name", "pet": "pet item name", "light_pet": "light pet item name" },
  "loadouts": {
    "2": { "class": "second class", "armor": ["helmet", "chest piece", "leggings"], "accessories": [{ "item": "accessory name", "prefix": "modifier" }] },
    "3": { "class": "third class", "armor": ["helmet", "chest piece", "leggings"], "accessories": [{ "item": "accessory name", "prefix": "modifier" }] }
  },
  "items": [
    { "item": "boss buff potion name", "stack": 30, "favorite": true },
    { "item": "Void Bag" },
    { "item": "Shellphone", "favorite": true }
  ],
  "storage": {
    "piggy_bank": { "mode": "add", "items": [{ "item": "utility potion name", "stack": 30 }] },
    "safe": { "mode": "add", "items": [] },
    "defenders_forge": { "mode": "add", "items": [] },
    "void_vault": { "mode": "add", "items": [] }
  },
  "character": {
    "max_life": 500,
    "max_mana": 200,
    "demon_heart": true,
    "minecart_upgrade": true,
    {{JOURNEY_FIELD}}"boosters": "all"
  },
  "unsupported": [{ "recommendation": "something to do in-game", "reason": "why a character file can't do it" }],
  "notes": "Version researched: ...
Item: why. https://terraria.wiki.gg/wiki/...
..."
}
```
