// Page helpers for the edit table and its problem list.

/** Row ids let the problem list jump to a row. */
export function rowId(path: string): string {
  return `row-${path.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/** Opens the row's section, scrolls to it and puts the cursor in it. */
export function jumpTo(path: string): void {
  // The row itself, or the nearest row above it (a field of a row, or a whole list).
  let id = rowId(path)
  let el = document.getElementById(id)
  let p = path
  while (!el && /[.[]/.test(p)) {
    p = p.replace(/(\.[^.[\]]+|\[\d+\])$/, '')
    id = rowId(p)
    el = document.getElementById(id)
  }
  if (!el) return
  const details = el.closest('details')
  if (details) details.open = true
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  el.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
}
