// The editable loadout: one section per part of loadsmith/1, each row with a
// searchable item, a modifier that fits it, an amount and a favorite box.

import { itemById, displayName } from '../data/index.ts'
import type { Entry, Issue, ItemRef, Loadout } from '../loadout/index.ts'
import { BOOSTERS, CHARACTER_KEYS, STORAGE_NAMES } from '../loadout/schema.ts'
import { Combobox, type ComboOption } from './Combobox.tsx'
import { rowId } from './dom.ts'
import { appendAt, entryParts, gearBase, getAt, removeAt, resolveItem, setAt, withField } from './logic/entries.ts'
import { type ItemFilter, itemOptions, modifierMatches, modifierOptions } from './logic/options.ts'
import { issuesFor } from './logic/paths.ts'

interface Ctx {
  loadout: Loadout
  version: number
  journey: boolean
  issues: Issue[]
  onChange: (next: Loadout) => void
}

function nameOf(ref: ItemRef | undefined, version: number): string {
  if (ref === undefined) return ''
  if (typeof ref === 'number') {
    const item = itemById(ref)
    return item ? displayName(item, version) : String(ref)
  }
  return ref
}

function itemChoices(version: number, filter: ItemFilter) {
  return (q: string): ComboOption[] => itemOptions(q, version, filter).map((o) => ({ key: o.id, label: o.name, value: o.value }))
}

interface Cols {
  prefix?: boolean
  stack?: boolean
  favorite?: boolean
}

function EntryRow({
  ctx,
  path,
  label,
  filter,
  cols,
  onRemove,
  allowEmpty,
}: {
  ctx: Ctx
  path: string
  label: string
  filter: ItemFilter
  cols: Cols
  onRemove?: () => void
  /** An empty item leaves the slot as it is: null for armor and hotbar, no key for equipment. */
  allowEmpty?: 'null' | 'delete'
}) {
  const entry = getAt(ctx.loadout, path) as Entry | null | undefined
  const parts = entryParts(entry)
  const issues = issuesFor(ctx.issues, path)
  const errors = issues.filter((i) => i.severity === 'error')
  const item = resolveItem(parts?.item, ctx.version)
  const mods = modifierOptions(item, ctx.version)
  const set = (next: Entry | null | undefined) => ctx.onChange(setAt(ctx.loadout, path, next))
  const field = (f: 'prefix' | 'stack' | 'favorite', v: unknown) => set(withField(entry ?? '', f, v))
  const itemError = errors.some((e) => e.path === path || e.path === `${path}.item`)
  const prefixError = errors.some((e) => e.path === `${path}.prefix`)
  const stackError = errors.some((e) => e.path === `${path}.stack`)

  return (
    <tr id={rowId(path)} className={errors.length ? 'row-error' : issues.length ? 'row-warning' : undefined}>
      <th scope="row">{label}</th>
      <td>
        <Combobox
          label={`${label}: item`}
          value={nameOf(parts?.item, ctx.version)}
          placeholder={allowEmpty ? 'Leave as it is' : 'Search items'}
          invalid={itemError}
          options={itemChoices(ctx.version, filter)}
          onCommit={(v) => {
            if (v === '') return set(allowEmpty === 'null' ? null : undefined)
            set(entry === null || entry === undefined ? v : withField(entry, 'item', v))
          }}
        />
      </td>
      <td>
        {cols.prefix &&
          (mods.length > 0 || parts?.prefix !== undefined ? (
            <Combobox
              label={`${label}: modifier`}
              value={parts?.prefix === undefined ? '' : String(parts.prefix)}
              placeholder={item ? 'Keep its own' : ''}
              invalid={prefixError}
              options={(q) => [
                ...(q ? [] : [{ key: 'none', label: '', value: '', hint: 'Keep its own modifier' }]),
                ...modifierMatches(mods, q).map((m) => ({ key: m.id, label: m.name, value: m.name, hint: m.best ? 'Best' : undefined })),
              ]}
              onCommit={(v) => field('prefix', v === '' ? undefined : v)}
            />
          ) : (
            <span className="muted">{item ? 'No modifier' : ''}</span>
          ))}
      </td>
      <td>
        {cols.stack && (
          <input
            type="number"
            min={1}
            max={9999}
            aria-label={`${label}: amount`}
            aria-invalid={stackError || undefined}
            className={stackError ? 'invalid num' : 'num'}
            value={parts?.stack ?? ''}
            placeholder="1"
            onChange={(e) => field('stack', e.target.value === '' ? undefined : Math.trunc(Number(e.target.value)))}
          />
        )}
      </td>
      <td className="center">
        {cols.favorite && (
          <input
            type="checkbox"
            aria-label={`${label}: favorite`}
            checked={parts?.favorite === true}
            disabled={!parts}
            onChange={(e) => field('favorite', e.target.checked)}
          />
        )}
      </td>
      <td className="center">
        {onRemove && (
          <button type="button" className="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

function TableHead({ cols }: { cols: Cols }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="w-label">
          <span className="sr-only">Slot</span>
        </th>
        <th scope="col">Item</th>
        <th scope="col" className="w-mod">
          {cols.prefix ? 'Modifier' : ''}
        </th>
        <th scope="col" className="w-num">
          {cols.stack ? 'Amount' : ''}
        </th>
        <th scope="col" className="w-fav">
          {cols.favorite ? 'Favorite' : ''}
        </th>
        <th scope="col" className="w-x">
          <span className="sr-only">Remove</span>
        </th>
      </tr>
    </thead>
  )
}

function Section({ title, count, ctx, paths, children }: { title: string; count?: string; ctx: Ctx; paths: string[]; children: React.ReactNode }) {
  const issues = ctx.issues.filter((i) => paths.some((p) => i.path === p || i.path.startsWith(p)))
  const errors = issues.filter((i) => i.severity === 'error').length
  const open = paths.some((p) => getAt(ctx.loadout, p) !== undefined) || issues.length > 0
  return (
    <details className="section" open={open || undefined}>
      <summary>
        <span className="section-title">{title}</span>
        {count && <span className="muted"> {count}</span>}
        {errors > 0 && <span className="badge badge-error">{errors === 1 ? '1 problem' : `${errors} problems`}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

function ListRows({
  ctx,
  path,
  labelFor,
  filter,
  cols,
  max,
  addLabel,
}: {
  ctx: Ctx
  path: string
  labelFor: (i: number) => string
  filter: ItemFilter
  cols: Cols
  max: number
  addLabel: string
}) {
  const list = getAt(ctx.loadout, path)
  const rows = Array.isArray(list) ? list : []
  return (
    <>
      <table className="grid">
        <TableHead cols={cols} />
        <tbody>
          {rows.map((_, i) => (
            <EntryRow
              key={i}
              ctx={ctx}
              path={`${path}[${i}]`}
              label={labelFor(i)}
              filter={filter}
              cols={cols}
              onRemove={() => ctx.onChange(removeAt(ctx.loadout, path, i))}
            />
          ))}
        </tbody>
      </table>
      {rows.length < max && (
        <button type="button" className="link" onClick={() => ctx.onChange(appendAt(ctx.loadout, path, ''))}>
          + {addLabel}
        </button>
      )}
    </>
  )
}

const ARMOR_LABELS = ['Helmet', 'Chest piece', 'Leggings']
const ARMOR_FILTERS: ItemFilter[] = ['head', 'body', 'legs']

function GearSection({ ctx, n }: { ctx: Ctx; n: 1 | 2 | 3 }) {
  const base = gearBase(ctx.loadout, n)
  const armorPath = `${base}armor`
  const armor = getAt(ctx.loadout, armorPath)
  const accCount = (getAt(ctx.loadout, `${base}accessories`) as unknown[] | undefined)?.length ?? 0
  const cls = getAt(ctx.loadout, `${base}class`)
  return (
    <Section
      title={n === 1 ? 'Armor and accessories (loadout 1)' : `Loadout ${n}`}
      count={typeof cls === 'string' && cls ? `(${cls})` : undefined}
      ctx={ctx}
      paths={n === 1 && !base ? ['armor', 'accessories'] : [`loadouts.${n}`]}
    >
      <table className="grid">
        <TableHead cols={{}} />
        <tbody>
          {ARMOR_LABELS.map((label, i) =>
            Array.isArray(armor) ? (
              <EntryRow key={i} ctx={ctx} path={`${armorPath}[${i}]`} label={label} filter={ARMOR_FILTERS[i]!} cols={{}} allowEmpty="null" />
            ) : null,
          )}
        </tbody>
      </table>
      {!Array.isArray(armor) && (
        <button type="button" className="link" onClick={() => ctx.onChange(setAt(ctx.loadout, armorPath, [null, null, null]))}>
          + Set armor
        </button>
      )}
      <ListRows
        ctx={ctx}
        path={`${base}accessories`}
        labelFor={(i) => `Accessory ${i + 1}`}
        filter="accessory"
        cols={{ prefix: true }}
        max={7}
        addLabel={accCount ? 'Add accessory' : 'Set accessories'}
      />
    </Section>
  )
}

const EQUIPMENT: { key: string; label: string; filter: ItemFilter }[] = [
  { key: 'hook', label: 'Hook', filter: 'any' },
  { key: 'mount', label: 'Mount', filter: 'mount' },
  { key: 'minecart', label: 'Minecart', filter: 'any' },
  { key: 'pet', label: 'Pet', filter: 'any' },
  { key: 'light_pet', label: 'Light pet', filter: 'any' },
]

const STORAGE_TITLES: Record<string, string> = {
  piggy_bank: 'Piggy bank',
  safe: 'Safe',
  defenders_forge: "Defender's Forge",
  void_vault: 'Void Vault',
}

const BOOSTER_LABELS: Record<string, string> = {
  vital_crystal: 'Vital Crystal',
  aegis_fruit: 'Aegis Fruit',
  arcane_crystal: 'Arcane Crystal',
  galaxy_pearl: 'Galaxy Pearl',
  gummy_worm: 'Gummy Worm',
  ambrosia: 'Ambrosia',
  artisan_loaf: 'Artisan Loaf',
  torch_god: "Torch God's Favor",
}

function NumberField({ ctx, path, label, max }: { ctx: Ctx; path: string; label: string; max: number }) {
  const v = getAt(ctx.loadout, path)
  const errors = issuesFor(ctx.issues, path).filter((i) => i.severity === 'error')
  return (
    <label className="field" id={rowId(path)}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        className={errors.length ? 'invalid num' : 'num'}
        aria-invalid={errors.length > 0 || undefined}
        value={typeof v === 'number' ? v : ''}
        placeholder="No change"
        onChange={(e) => ctx.onChange(setAt(ctx.loadout, path, e.target.value === '' ? undefined : Math.trunc(Number(e.target.value))))}
      />
    </label>
  )
}

function CheckField({ ctx, path, label, onValue }: { ctx: Ctx; path: string; label: string; onValue?: unknown }) {
  const v = getAt(ctx.loadout, path)
  const on = onValue ?? true
  return (
    <label className="check" id={rowId(path)}>
      <input type="checkbox" checked={v === on} onChange={(e) => ctx.onChange(setAt(ctx.loadout, path, e.target.checked ? on : undefined))} />
      {label}
    </label>
  )
}

function CharacterSection({ ctx }: { ctx: Ctx }) {
  const boosters = getAt(ctx.loadout, 'character.boosters')
  const list = Array.isArray(boosters) ? (boosters as string[]) : []
  const ch = getAt(ctx.loadout, 'character')
  const flags = ch && typeof ch === 'object' ? Object.keys(ch).filter((k) => !(CHARACTER_KEYS as readonly string[]).includes(k)) : []
  return (
    <Section title="Character" ctx={ctx} paths={['character']}>
      <div className="fields">
        <NumberField ctx={ctx} path="character.max_life" label="Max life (up to 500)" max={500} />
        <NumberField ctx={ctx} path="character.max_mana" label="Max mana (up to 200)" max={200} />
      </div>
      <div className="checks">
        <CheckField ctx={ctx} path="character.demon_heart" label="Demon Heart (extra accessory slot)" />
        <CheckField ctx={ctx} path="character.minecart_upgrade" label="Minecart Upgrade Kit" />
        {(ctx.journey || getAt(ctx.loadout, 'character.journey_research') !== undefined) && (
          <CheckField ctx={ctx} path="character.journey_research" label="Research every item (Journey)" onValue="full" />
        )}
      </div>
      <fieldset className="boosters" id={rowId('character.boosters')}>
        <legend>Permanent boosters</legend>
        <CheckField ctx={ctx} path="character.boosters" label="All of them" onValue="all" />
        {boosters !== 'all' &&
          BOOSTERS.map((b) => (
            <label key={b} className="check">
              <input
                type="checkbox"
                checked={list.includes(b)}
                onChange={(e) => {
                  const next = e.target.checked ? [...list, b] : list.filter((x) => x !== b)
                  ctx.onChange(setAt(ctx.loadout, 'character.boosters', next.length ? next : undefined))
                }}
              />
              {BOOSTER_LABELS[b] ?? b}
            </label>
          ))}
      </fieldset>
      {flags.length > 0 && (
        <div className="checks">
          {flags.map((f) => (
            <span key={f} className="flag" id={rowId(`character.${f}`)}>
              <CheckField ctx={ctx} path={`character.${f}`} label={f.replace(/_/g, ' ')} />
              <button type="button" className="icon" aria-label={`Remove ${f}`} onClick={() => ctx.onChange(setAt(ctx.loadout, `character.${f}`, undefined))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}

export function EditTable({ loadout, version, journey, issues, onChange }: Ctx) {
  const ctx: Ctx = { loadout, version, journey, issues, onChange }
  const hotbar = getAt(loadout, 'hotbar')
  return (
    <div className="edit-table">
      <GearSection ctx={ctx} n={1} />
      <Section title="Weapons" ctx={ctx} paths={['weapons']}>
        <p className="hint">Weapons go in the hotbar from slot 1. One you already own is moved there instead of copied.</p>
        <ListRows ctx={ctx} path="weapons" labelFor={(i) => `Weapon ${i + 1}`} filter="any" cols={{ prefix: true, stack: true, favorite: true }} max={10} addLabel="Add weapon" />
      </Section>
      <Section title="Hotbar order" ctx={ctx} paths={['hotbar']}>
        {Array.isArray(hotbar) ? (
          <table className="grid">
            <TableHead cols={{}} />
            <tbody>
              {Array.from({ length: 10 }, (_, i) => (
                <EntryRow key={i} ctx={ctx} path={`hotbar[${i}]`} label={`Slot ${i + 1}`} filter="any" cols={{}} allowEmpty="null" />
              ))}
            </tbody>
          </table>
        ) : (
          <button type="button" className="link" onClick={() => ctx.onChange(setAt(loadout, 'hotbar', Array(10).fill(null)))}>
            + Set hotbar order
          </button>
        )}
      </Section>
      <Section title="Ammo" ctx={ctx} paths={['ammo']}>
        <ListRows ctx={ctx} path="ammo" labelFor={(i) => `Ammo ${i + 1}`} filter="any" cols={{ stack: true, favorite: true }} max={4} addLabel="Add ammo" />
      </Section>
      <Section title="Coins" ctx={ctx} paths={['coins']}>
        <div className="fields">
          {(['platinum', 'gold', 'silver', 'copper'] as const).map((c) => (
            <NumberField key={c} ctx={ctx} path={`coins.${c}`} label={`${c.charAt(0).toUpperCase()}${c.slice(1)}`} max={c === 'platinum' ? 9999 : 100} />
          ))}
        </div>
      </Section>
      <Section title="Hook, mount and pets" ctx={ctx} paths={['equipment']}>
        <table className="grid">
          <TableHead cols={{}} />
          <tbody>
            {EQUIPMENT.map((e) => (
              <EntryRow key={e.key} ctx={ctx} path={`equipment.${e.key}`} label={e.label} filter={e.filter} cols={{}} allowEmpty="delete" />
            ))}
          </tbody>
        </table>
      </Section>
      <GearSection ctx={ctx} n={2} />
      <GearSection ctx={ctx} n={3} />
      <Section title="Extra items" ctx={ctx} paths={['items']}>
        <p className="hint">These go in free inventory slots, then storage.</p>
        <ListRows ctx={ctx} path="items" labelFor={(i) => `Item ${i + 1}`} filter="any" cols={{ prefix: true, stack: true, favorite: true }} max={200} addLabel="Add item" />
      </Section>
      {STORAGE_NAMES.map((s) => {
        const path = `storage.${s}`
        const mode = getAt(loadout, `${path}.mode`) === 'replace' ? 'replace' : 'add'
        return (
          <Section key={s} title={STORAGE_TITLES[s]!} ctx={ctx} paths={[path]}>
            <fieldset className="mode" id={rowId(`${path}.mode`)}>
              <legend className="sr-only">{STORAGE_TITLES[s]} mode</legend>
              <label className="check">
                <input type="radio" name={`${s}-mode`} checked={mode === 'add'} onChange={() => onChange(setAt(loadout, `${path}.mode`, 'add'))} />
                Add to what's there
              </label>
              <label className="check">
                <input type="radio" name={`${s}-mode`} checked={mode === 'replace'} onChange={() => onChange(setAt(loadout, `${path}.mode`, 'replace'))} />
                <span>
                  Empty it first <span className="danger-text">(deletes everything in it)</span>
                </span>
              </label>
            </fieldset>
            <ListRows ctx={ctx} path={`${path}.items`} labelFor={(i) => `Item ${i + 1}`} filter="any" cols={{ prefix: true, stack: true }} max={40} addLabel="Add item" />
          </Section>
        )
      })}
      <CharacterSection ctx={ctx} />
    </div>
  )
}
