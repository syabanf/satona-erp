/** RFC 4180 CSV: quotes every cell that holds a comma, quote or line break. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

/**
 * Reads CSV or cells pasted from Excel (tab separated). The delimiter is the first of tab, semicolon or comma found in
 * the header line; quoted cells may hold delimiters, quotes ("") and line breaks. Blank lines are dropped.
 */
export function parseTable(text: string): string[][] {
  const head = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = head.includes('\t') ? '\t' : head.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) rows.push([...row, cell])
  return rows.filter((r) => r.some((c) => c.trim() !== '')).map((r) => r.map((c) => c.trim()))
}
