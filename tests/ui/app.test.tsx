// @vitest-environment jsdom
// The four screens, driven the way a player would: load a file, copy the
// prompt, paste an answer, fix it, preview, download. Uses a made-up
// character built in the test, so it runs without any real saves.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App.tsx'
import { initialState, reducer } from '../../src/ui/state.ts'
import { itemByKey } from '../../src/data/index.ts'
import { type PlayerCharacter, createEmptyPlayer, loadPlayer, savePlayer } from '../../src/format/index.ts'

function id(key: string): number {
  const item = itemByKey(key)
  if (!item) throw new Error(key)
  return item.id
}

function character(version = 326): PlayerCharacter {
  const p = createEmptyPlayer(version)
  p.name = 'Tester'
  p.statLifeMax = 400
  p.statManaMax = 200
  p.inventory[0] = { netId: id('Megashark'), stack: 1, prefix: 0, favorited: false }
  p.armor[3] = { netId: id('HermesBoots'), stack: 1, prefix: 65, favorited: false }
  p.bank2[0] = { netId: id('Torch'), stack: 99, prefix: 0, favorited: false }
  return p
}

async function plrFile(p = character(), name = 'Tester.plr'): Promise<File> {
  return new File([(await savePlayer(p)) as Uint8Array<ArrayBuffer>], name)
}

/** Captures what "Download" saves. */
let downloaded: Blob | undefined
let downloadedName: string | undefined

beforeEach(() => {
  downloaded = undefined
  downloadedName = undefined
  URL.createObjectURL = vi.fn((b: Blob) => {
    downloaded = b
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download
  })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function loadInto(user: ReturnType<typeof userEvent.setup>, file?: File) {
  await user.upload(screen.getByLabelText('Character file'), file ?? (await plrFile()))
  await screen.findByText('Tester', { selector: '.char-name' })
}

async function downloadedCharacter(): Promise<PlayerCharacter> {
  expect(downloaded).toBeDefined()
  return loadPlayer(new Uint8Array(await downloaded!.arrayBuffer()))
}

describe('step 1', () => {
  it('shows the character summary', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadInto(user)
    expect(screen.getByText(/Classic, Softcore · Terraria 1\.4\.5\.8/)).toBeTruthy()
    expect(screen.getByText('Warding Hermes Boots')).toBeTruthy()
    expect(screen.queryByText(/latest Terraria first/)).toBeNull()
  })

  it('puts the outdated message first for a 1.4.4.9 save', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadInto(user, await plrFile(character(279)))
    const notice = screen.getByText(/Load and save this character in the latest Terraria first/)
    const name = screen.getByText('Tester', { selector: '.char-name' })
    expect(notice.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('explains files it can\'t read', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    await user.upload(screen.getByLabelText('Character file'), new File(['hello'], 'notes.txt'))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/doesn't look like a Terraria character/))
  })

  it('"Just make my gear perfect" goes straight to the preview and downloads', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadInto(user)
    await user.click(screen.getByRole('button', { name: 'Make my gear perfect' }))
    expect(screen.getByRole('heading', { name: 'Best modifiers for everything you own' })).toBeTruthy()
    expect(screen.getByText(/Megashark: no modifier → Unreal/)).toBeTruthy()
    expect(screen.getByText(/Hermes Boots: Warding → Menacing/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Download new character' }))
    await screen.findByText(/Downloaded Tester\.plr/)
    expect(downloadedName).toBe('Tester.plr')
    const after = await downloadedCharacter()
    expect(after.inventory[0]).toMatchObject({ netId: id('Megashark'), prefix: 82 })
    expect(after.armor[3]).toMatchObject({ netId: id('HermesBoots'), prefix: 72 })
    expect(after.bank2[0]).toMatchObject({ netId: id('Torch'), stack: 99 })
  })
})

describe('steps 2 to 4', () => {
  it('copies the prompt, takes a pasted answer, applies a fix and downloads', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<App />)
    await loadInto(user)
    await user.click(screen.getByRole('button', { name: 'Next: get the prompt' }))

    // Copying first asks for the missing choices.
    await user.click(screen.getByRole('button', { name: 'Copy prompt' }))
    expect(screen.getByText('Pick a class first.')).toBeTruthy()
    expect(writeText).not.toHaveBeenCalled()
    await user.click(screen.getByText('Ranged'))
    await user.click(screen.getByText('Master'))
    await user.click(screen.getByRole('button', { name: 'Copy prompt' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]?.[0]).toContain('"class": "ranged"')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Next: paste the answer' }))
    const answer = [
      'Here is your loadout:',
      '```json',
      JSON.stringify({
        schema: 'loadsmith/1',
        accessories: [{ item: 'Celestial Shel', prefix: 'Menacing' }],
        weapons: [{ item: 'Megashark', prefix: 'Unreal', favorite: true }],
        storage: { safe: { mode: 'replace', items: ['Wooden Sword'] } },
        unsupported: [{ recommendation: 'Defeat the Moon Lord', reason: 'World progress' }],
      }),
      '```',
    ].join('\n')
    await user.click(screen.getByLabelText("Paste the AI's whole answer here"))
    await user.paste(answer)

    // The misspelling blocks; the "did you mean" button fixes it.
    const problems = await screen.findByRole('alert')
    expect(problems.textContent).toMatch(/Accessory 1: Unknown item "Celestial Shel"/)
    await user.click(within(problems).getByRole('button', { name: 'Celestial Shell' }))
    await waitFor(() => expect(screen.queryByText(/things? to fix/)).toBeNull())
    expect((screen.getByRole('combobox', { name: 'Accessory 1: item' }) as HTMLInputElement).value).toBe('Celestial Shell')

    // The answer didn't set best_modifiers, so the step 2 toggle (on) applies.
    expect((screen.getByRole('checkbox', { name: /Best modifiers for everything/ }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Next: check the changes' }))
    const deleted = screen.getByText(/Deleted because a storage space/).closest('details')!
    expect(within(deleted).getByText('Torch ×99')).toBeTruthy()
    expect(screen.getByText(/Defeat the Moon Lord/)).toBeTruthy()

    // Deleting needs a tick first.
    const download = screen.getByRole('button', { name: 'Download new character' }) as HTMLButtonElement
    expect(download.disabled).toBe(true)
    await user.click(screen.getByLabelText(/will be gone/))
    await user.click(download)
    await screen.findByText(/Downloaded Tester\.plr/)
    const after = await downloadedCharacter()
    expect(after.armor.slice(3).some((i) => i.netId === id('CelestialShell') && i.prefix === 72)).toBe(true)
    expect(after.inventory[0]).toMatchObject({ netId: id('Megashark'), prefix: 82, favorited: true })
    expect(after.bank2[0]).toMatchObject({ netId: id('WoodenSword') })
  })

  it('edits through the table: pick an item from the dropdown', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadInto(user)
    await user.click(screen.getByRole('button', { name: /Paste and edit/ }))
    await user.click(screen.getByLabelText("Paste the AI's whole answer here"))
    await user.paste('{"schema":"loadsmith/1","accessories":["Hermes Boots"]}')
    const box = await screen.findByRole('combobox', { name: 'Accessory 1: item' })
    await user.clear(box)
    await user.type(box, 'ankh shi')
    await user.click(await screen.findByRole('option', { name: 'Ankh Shield' }))
    expect((box as HTMLInputElement).value).toBe('Ankh Shield')
    const mod = screen.getByRole('combobox', { name: 'Accessory 1: modifier' })
    await user.click(mod)
    expect(screen.getAllByRole('option')[1]?.textContent).toMatch(/Menacing.*Best/)
  })
})

describe('start over and load another character', () => {
  it('keep the prompt settings', async () => {
    let s = reducer(initialState, { type: 'loaded', name: 'a.plr', character: character() })
    s = reducer(s, { type: 'choices', choices: { class: 'magic', goal: 'general', world: 'expert', bestModifiers: false } })
    s = reducer(s, { type: 'paste', text: '{"schema":"loadsmith/1","best_modifiers":true}' })
    expect(s.loadout?.best_modifiers).toBe(true)
    expect(s.choices.bestModifiers).toBe(true)

    const over = reducer({ ...s, step: 3 }, { type: 'startOver' })
    expect(over).toMatchObject({ step: 2, loadout: undefined, pasted: '', choices: { class: 'magic', goal: 'general', world: 'expert' } })
    expect(over.file?.name).toBe('a.plr')

    const another = reducer({ ...s, step: 4 }, { type: 'loadAnother' })
    expect(another).toMatchObject({ step: 1, file: undefined, loadout: undefined, choices: { class: 'magic', world: 'expert' } })
  })

  it('work from the header', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadInto(user)
    await user.click(screen.getByRole('button', { name: 'Next: get the prompt' }))
    await user.click(screen.getByText('Summon'))
    await user.click(screen.getByRole('button', { name: 'Next: paste the answer' }))
    await user.click(screen.getByLabelText("Paste the AI's whole answer here"))
    await user.paste('{"schema":"loadsmith/1"}')
    await screen.findByText(/Loadout loaded/)

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    await user.click(screen.getByRole('button', { name: 'Yes, start over' }))
    expect(screen.getByRole('heading', { name: 'Get the prompt' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Summon' }) as HTMLInputElement).checked).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Load another character' }))
    expect(screen.getByText('Drop your character file here')).toBeTruthy()
    await loadInto(user)
    await user.click(screen.getByRole('button', { name: 'Next: get the prompt' }))
    expect((screen.getByRole('radio', { name: 'Summon' }) as HTMLInputElement).checked).toBe(true)
  })
})
