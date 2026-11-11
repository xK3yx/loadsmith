# Loadsmith

Build the strongest Terraria character for the current update. Paste an AI-written loadout, edit it, and download your upgraded character file. Everything runs in your browser, and your save never leaves your computer.

> Status: in development. See [PLAN.md](PLAN.md).

## How it works

1. **Load** your character (`.plr` file) into the page.
2. **Copy the prompt** and paste it into any AI with web search (ChatGPT, Claude, Gemini). It researches the latest update and writes a loadout as JSON.
3. **Paste the JSON** back. Loadsmith checks every item and modifier, suggests fixes for mistakes, and lets you edit anything.
4. **Download** the new `.plr` and put it in your Players folder.

Always keep a backup of your original character.

## Where your characters are

| System | Folder |
| --- | --- |
| Windows | `Documents\My Games\Terraria\Players` |
| macOS | `~/Library/Application Support/Terraria/Players` |
| Linux | `~/.local/share/Terraria/Players` |

Steam Cloud characters live in your Steam `userdata` folder instead.

## Support

- PC saves (Steam and GOG) from 1.4.4.9 through 1.4.5.8.
- Not supported: mobile and console saves, tModLoader characters.
- Meant for single-player and friends' worlds. Servers with server-side characters ignore local files.

## Credits and license

Save-file handling and game data are ported from [TEdit](https://github.com/TEdit/Terraria-Map-Editor) by the TEdit contributors. Loadsmith is released under the [Microsoft Public License (MS-PL)](LICENSE), the same license as TEdit.

Loadsmith is a fan project and is not affiliated with or endorsed by Re-Logic. Terraria is a trademark of Re-Logic.
