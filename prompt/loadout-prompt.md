You are helping a Terraria player set up their character. Loadsmith, a character editor, will read your answer and apply it to their character file, so the format below matters.

## The player

- Game: Terraria on PC, version {{GAME_VERSION}} (the character's save version).
- Character mode: {{MODE}}.
- {{WORLD_LINE}}
- Class: {{CLASS_LINE}}
- Goal: {{GOAL_LINE}}

## Before you answer

1. Search the web for the latest PC version of Terraria and the current best-in-slot gear for this class, preferring terraria.wiki.gg. Only pick items that exist in Terraria {{GAME_VERSION}}.
2. Check the items and modifiers added or changed in the latest update, not just older guides. Many guides predate 1.4.5, so look at the latest version's patch notes or the wiki's update pages and consider new gear (for example the 1.4.5 summon modifiers such as Fabled) before falling back on older best-in-slot lists.

## Rules

3. Use exact English item and modifier names as written on the wiki.
4. Pick only modifiers that exist for that item type: accessory, melee, ranged, magic or summon. Whips take melee modifiers.
5. Fill exactly {{SLOTS}} accessory slots.
6. Match accessories to the weapon's ammo type. An ammo accessory only helps the ammo it names: the Phoenix Quiver (like the Magic Quiver and Molten Quiver) only helps arrows, so it's wasted on a gun build; gun builds need bullet accessories such as the Sniper Scope or Recon Scope instead. The same goes for rocket and dart weapons. Every accessory must help a weapon in the same loadout.
7. Optimize for the goal above and write it in "goal". The goal changes picks: for example Luminite Bullets (piercing, single-target damage) for bosses but Crystal Bullets (splitting shards for crowds) for general play, and likewise single-target versus area weapons and accessories.
8. Fill every section of the format: armor, accessories, weapons, hotbar order and favorites, ammo, coins, equipment (hook, mount, minecart, pet, light pet), loadouts 2 and 3, items, storage (piggy bank, safe, Defender's Forge, Void Vault, each with a mode) and character (max life and mana, Demon Heart, Minecart Upgrade Kit, boosters{{JOURNEY_RULE}}).
9. Storage "mode" is "add" (keeps what's there; use this unless you have a reason) or "replace" (deletes everything in that space first).
10. Put anything you recommend that a character file can't hold (bosses to defeat, NPC upgrades, the Peddler's Satchel, world difficulty) in "unsupported", with a reason.
11. Set "best_modifiers" to {{BEST_MODIFIERS}}.{{BEST_MODIFIERS_NOTE}}
12. In "notes", say which Terraria version you researched, and cite a source (a wiki page or guide URL) for each pick.
13. Reply with exactly one JSON code block in the format below and nothing else. Put all reasoning in "notes".

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
  "items": [{ "item": "potion name", "stack": 9999, "favorite": true }],
  "storage": {
    "piggy_bank": { "mode": "add", "items": [] },
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
  "notes": "Version researched, why each pick was made, and a source for each."
}
```
