// A small searchable dropdown (ARIA combobox pattern). Typing filters the
// list; Enter, a click or leaving the field keeps the choice. Free text is
// kept as typed, so the checker can flag it and offer "did you mean" fixes.

import { useId, useRef, useState } from 'react'

export interface ComboOption {
  key: string | number
  label: string
  value: string | number
  hint?: string
}

interface Props {
  value: string
  options: (query: string) => ComboOption[]
  onCommit: (value: string | number) => void
  label: string
  placeholder?: string
  invalid?: boolean
  id?: string
}

export function Combobox({ value, options, onCommit, label, placeholder, invalid, id }: Props) {
  const listId = useId()
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [lastValue, setLastValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow outside changes (a "did you mean" fix, a reload) while not typing.
  if (value !== lastValue) {
    setLastValue(value)
    if (!open) setText(value)
  }

  const shown = open ? options(text === value ? '' : text) : []

  function commit(next: string | number, label: string) {
    setText(label)
    setOpen(false)
    if (String(next) !== value && label !== value) onCommit(next)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault()
      const pick = shown[active]
      if (pick && text !== value) commit(pick.value, pick.label)
      else commit(text.trim(), text.trim())
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setText(value)
      }
    }
  }

  return (
    <div className="combo">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        className={invalid ? 'invalid' : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          e.currentTarget.select()
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => {
          if (!open) return
          const typed = text.trim()
          setOpen(false)
          if (typed !== value) {
            const exact = options(typed).find((o) => o.label.toLowerCase() === typed.toLowerCase())
            commit(exact ? exact.value : typed, exact ? exact.label : typed)
          }
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="combo-list" role="listbox" id={listId} aria-label={label}>
          {shown.length === 0 ? (
            <li className="combo-empty" role="presentation">
              No matches
            </li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value, o.label)}
              >
                <span>{o.label}</span>
                {o.hint && <span className="combo-hint">{o.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
