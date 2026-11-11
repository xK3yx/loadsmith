# Terraria player save format (.plr)

How Loadsmith reads and writes PC character files, as we understand the format. The code in `src/format/` is ported from [TEdit](https://github.com/TEdit/Terraria-Map-Editor) (`src/TEdit.Terraria/Player/PlayerFile.cs`, MS-PL); this document exists so the project doesn't depend on TEdit staying available. Checked against real saves from 1.4.4.9 (save version 279) and 1.4.5.8 (326).

"Version" below always means the save version stored in the file, not the game version. The mapping is in `src/data/tedit/versions.json` (for example 279 = 1.4.4.9, 315 = 1.4.5.0, 326 = 1.4.5.8).

## Encryption

The whole file is encrypted with AES-128-CBC.

- Key and IV are both the 16 UTF-16LE bytes of the string `h3y_gUyZ`.
- Padding is PKCS7. (TEdit pads with zeros instead; real files use PKCS7, and only PKCS7 reproduces the original bytes.)
- Because the key and IV are fixed, the same plaintext always encrypts to the same bytes, which is what makes byte-for-byte round trips possible.

## Primitive types

All little-endian, matching .NET's `BinaryReader`/`BinaryWriter`.

| Type | Size | Notes |
| --- | --- | --- |
| byte | 1 | |
| bool | 1 | 0 = false; any other value reads as true, written as 1 |
| int16 / uint16 | 2 | |
| int32 / uint32 | 4 | |
| int64 / uint64 | 8 | |
| float32 | 4 | IEEE 754 single |
| string | varies | Length in bytes as a 7-bit encoded integer (low 7 bits first, high bit = more bytes follow), then that many UTF-8 bytes |
| color | 3 | R, G, B bytes |
| item (short) | 5 | int32 item ID, byte modifier |
| item (stacked) | 9 | int32 item ID, int32 stack, byte modifier |

An item ID of 0 is an empty slot.

## File header

| Field | Type | Versions |
| --- | --- | --- |
| Save version | int32 | all |
| Re-Logic header | uint64 | 135+: the low 7 bytes are the ASCII text "relogic" (as a number, `0x6369676F6C6572`); the top byte is the file type, 3 = player |
| File revision | uint32 | 135+ |
| Metadata flags | uint64 | 135+: bit 0 = favorite character |

Loadsmith keeps the revision and flags exactly as read. (TEdit adds 1 to the revision when saving.)

## Body, in order

Each row is present only in the listed versions. Fields marked "raw" are kept exactly as stored, even where TEdit would clamp or normalize them.

### Header and appearance

| Field | Type | Versions |
| --- | --- | --- |
| Name | string | all |
| Difficulty | byte: 0 Classic, 1 Mediumcore, 2 Hardcore, 3 Journey | 17+ (10-16: a bool, true = Hardcore) |
| Play time | int64 ticks | 138+ |
| Hair style | int32 (raw) | all |
| Hair dye | byte | 82+ |
| Team | byte | 283+ |
| Hide visible accessory | 2 bytes, one bit per accessory slot (raw) | 124+ (83-123: 1 byte) |
| Hide misc | byte | 119+ |
| Skin variant | byte | 107+ (18-106: bool "male"; earlier: derived from hair) |

### Stats and flags

| Field | Type | Versions |
| --- | --- | --- |
| Life, max life, mana, max mana | 4 x int32 (raw) | all |
| Extra accessory slot (Demon Heart) | bool | 125+ |
| Torch God's Favor unlocked, in use | 2 x bool | 229+ |
| Ate Artisan Loaf | bool | 256+ |
| Reserved flag (written as false) | bool (raw) | 324+ |
| Used Vital Crystal, Aegis Fruit, Arcane Crystal, Galaxy Pearl, Gummy Worm, Ambrosia | 6 x bool | 260+ |
| Old One's Army beaten | bool | 182+ |
| Tax money | int32 | 128+ |
| Deaths (PvE, PvP) | 2 x int32 | 254+ |
| Hair, skin, eye, shirt, undershirt, pants, shoe colors | 7 x color | all |

The 1.4.5 fields (team at 283, reserved flag at 324, favorites at 322, and the lists at 300 and 310) are inserted early in the file, so everything after them moves. That is why patching fixed byte offsets only works for one version.

### Equipment (38+)

| Field | Layout | Versions |
| --- | --- | --- |
| Armor | 20 x (int32 ID, byte modifier, bool favorite if 322+) | 124+ (older: 11 or 16 entries, read only) |
| Dye | 10 x the same | 124+ (81-123: 8, 47-80: 3) |
| Inventory | 58 x (stacked item, bool favorite if 114+) | 58+ |
| Misc equipment and misc dyes | 5 x (short item, short item), interleaved | 117+ (slot 1 skipped before 136) |
| Piggy Bank, Safe | 40 x stacked item each | 58+ |
| Defender's Forge | 40 x stacked item | 182+ |
| Void Vault | 40 x (stacked item, bool favorite if 255+) | 198+ |
| Void Vault info | byte | 199+ |

Armor slots: 0-2 head, body, legs; 3-9 the seven functional accessory slots; 10-12 vanity armor; 13-19 vanity accessories. Dye slots follow the same order.

Inventory slots: 0-9 hotbar, 10-49 main inventory, 50-53 coins, 54-57 ammo.

Misc equipment slots: 0 pet, 1 light pet, 2 minecart, 3 mount, 4 grappling hook.

Armor, dye and misc slots don't store a stack; it is 1 when the slot holds an item.

### Buffs, spawn points and misc state

| Field | Layout | Versions |
| --- | --- | --- |
| Buffs | 44 x (int32 type, int32 time), every slot including empty ones (raw) | 252+ (74-251: 22, 11-73: 10) |
| Spawn points | up to 200 x (int32 X, int32 Y, int32 world ID, string world name), then int32 -1 | all |
| Hotbar locked | bool | 16+ |
| Hide info accessories | 13 x bool | 115+ |
| Angler quests finished | int32 | 98+ |
| D-pad radial bindings | 4 x int32 | 162+ |
| Builder accessory toggles | 12 x int32 | 230+ (197+: 11, 167+: 10, 164+: 8) |
| Tavernkeep quest log | int32 | 181+ |
| Dead | bool, then int32 respawn timer only if dead (raw) | 200+ |
| Last save time | int64 (.NET DateTime binary) | 202+ |
| Golfer score | int32 | 206+ |

### Journey mode and later

| Field | Layout | Versions |
| --- | --- | --- |
| Research | bool flag (282+, written as false), int32 count, then count x (string item key, int32 amount sacrificed) | 218+ |
| Temporary item slots | byte flags (bit 0 mouse, 1 Journey menu, 2 Guide, 3 Reforge), then a stacked item for each set bit | 214+ |
| Journey powers | repeated (bool true, int16 power ID, value), ended by bool false. Value is a bool for toggles, a float32 for sliders (8 time speed, 12 difficulty, 14 spawn rate) | 220+ |
| Minecart upgrade | byte: bit 0 unlocked, bit 1 enabled | 253+ |
| Current loadout | int32 (raw) | 262+ |
| Equipment loadouts | 3 x (20 armor + 10 dye as (stacked item, bool favorite if 322+), then 10 x bool hidden) | 262+ |
| Voice | byte | 280+ |
| Voice pitch | float32 | 281+ |
| Crafting refunds | int32 count, then count x stacked item | 300+ |
| One-time dialogues seen | int32 count, then count x string | 310+ |

Research keys are Terraria's internal item names (TEdit's item `key`, for example `DirtBlock`). In a fully researched entry the amount equals the item's research requirement.

Known Journey power IDs: 0 freeze time, 5 god mode, 8 time speed, 9 freeze rain, 10 freeze wind, 11 placement range, 12 difficulty, 13 freeze biome spread, 14 spawn rate. An unknown ID can't be skipped (its value size is unknown), so Loadsmith stops with an error instead of misreading the rest of the file.

**Equipment loadouts:** the active loadout's gear lives in the main armor and dye slots above, and its own entry in this list is saved empty. The other two loadouts are stored here.

After the last field there must be no bytes left before the padding. Loadsmith treats leftover bytes as an error, because they mean a field was missed.

## What Loadsmith changes from TEdit

TEdit normalizes some values when it reads them. That's useful in an editor, but it breaks byte-for-byte round trips, so Loadsmith keeps every value raw:

- no clamping of hair style, life, mana, respawn timer or loadout index
- every buff slot kept in order (TEdit drops empty ones and compacts)
- the reserved and research flags kept as read
- bit-field bytes kept raw
- item stacks kept raw (TEdit zeroes the ID when the stack is 0 and caps stacks at 32,767)
- research and Journey powers kept as ordered lists, not dictionaries
- the stored revision and save time written back unchanged

The full list is in the header comment of `src/format/playerFile.ts`.
