import { useEffect, useState } from 'react'
import { FileDown, Upload, X } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { validate, type Field, type RecordType, type Value, type Values } from '@/domain/records'
import { parseTable, toCsv } from '@/lib/csv'
import { useServices } from '../hooks/useServices'
import { useSession } from '../hooks/useSession'
import { Button } from '../ui/Button'
import { useToast } from '../ui/useToast'
import { ENTITY_NAME, recordTitle, type AllRecords } from './text'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "1.500.000" and "1,5" read as Indonesian numbers; "1,500.5" as English ones. */
function toNumber(raw: string): number | undefined {
  const s = raw.replace(/[^\d.,-]/g, '')
  if (!s) return undefined
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** One cell into a field value: options and companies match without case, references by id or by their title. */
function cellValue(f: Field, raw: string, all: AllRecords): Value | undefined {
  if (raw === '') return undefined
  if (f.type === 'number' || f.type === 'money') return toNumber(raw)
  if (f.type === 'select') return f.options?.find((o) => norm(o) === norm(raw)) ?? raw
  if (f.type === 'entity') return Object.entries(ENTITY_NAME).find(([id, name]) => norm(id) === norm(raw) || norm(name) === norm(raw))?.[0] ?? raw
  if (f.type === 'ref' && f.ref) {
    const target = typeOf(f.ref)
    const rows = all[f.ref] ?? []
    return (rows.find((r) => r.id === raw) ?? (target && rows.find((r) => norm(recordTitle(target, r, all)) === norm(raw))))?.id ?? raw
  }
  if (f.type === 'date') {
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw)
    return dmy ? `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}` : raw
  }
  return raw
}

/**
 * Bulk import into a record type from a CSV file or cells pasted from Excel. Columns match fields by key or label,
 * every row is checked against the schema first, and only the valid rows are created.
 */
export function ImportDialog({ type, all, onClose }: { type: RecordType; all: AllRecords; onClose: () => void }) {
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fields = type.fields.filter((f) => f.type !== 'computed')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const table = text.trim() ? parseTable(text) : []
  const [header = [], ...body] = table
  const columns = header.map((h) => fields.find((f) => norm(f.key) === norm(h) || norm(f.label) === norm(h)))
  const rows = body.map((cells) => {
    const values: Values = {}
    columns.forEach((f, i) => {
      if (f) values[f.key] = cellValue(f, cells[i] ?? '', all)
    })
    return { values, errors: validate(type, values) }
  })
  const valid = rows.filter((r) => !Object.keys(r.errors).length)

  const template = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${toCsv([fields.map((f) => f.label)])}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `template-${type.key}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function run() {
    setBusy(true)
    let done = 0
    for (const r of valid) {
      try {
        await records.create(role, type.key, r.values)
        done += 1
      } catch {
        /* counted below as not imported */
      }
    }
    setBusy(false)
    toast({ title: `${done} ${type.name.toLowerCase()} diimpor`, description: rows.length - done ? `${rows.length - done} baris dilewati karena belum valid.` : undefined })
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="fixed inset-0 z-[1000] grid place-items-center p-4">
      <button type="button" aria-label="Tutup" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-3xl animate-rise flex-col rounded-card border border-line bg-card shadow-float">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 id="import-title" className="flex-1 text-lg font-semibold">Impor {type.name.toLowerCase()}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Tutup" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-muted">Pilih file CSV, atau salin sel dari Excel lalu tempel di bawah. Baris pertama berisi nama kolom; kolom dicocokkan dengan nama field. Referensi boleh ditulis sebagai ID atau nama.</p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-invert px-4 text-sm font-semibold text-on-invert">
              <Upload aria-hidden className="size-4" /> Pilih file CSV
              <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={async (e) => setText((await e.target.files?.[0]?.text()) ?? '')} />
            </label>
            <Button variant="card" size="sm" onClick={template}>
              <FileDown aria-hidden className="size-4" /> Unduh template
            </Button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={fields.slice(0, 4).map((f) => f.label).join('\t')} aria-label="Data untuk diimpor" className="w-full rounded-panel border border-line-strong bg-raised p-3 font-mono text-xs outline-none focus:border-accent" />
          {header.length > 0 && (
            <>
              <p className="flex flex-wrap gap-1.5 text-xs">
                {header.map((h, i) => (
                  <span key={i} className={columns[i] ? 'rounded-full bg-success-soft px-2 py-0.5 text-success' : 'rounded-full bg-raised px-2 py-0.5 text-muted line-through'}>
                    {h}
                    {columns[i] && columns[i]!.label !== h ? ` → ${columns[i]!.label}` : ''}
                  </span>
                ))}
              </p>
              <p className="text-sm">
                <span className="font-semibold">{valid.length}</span> dari {rows.length} baris siap diimpor.
              </p>
              <ul className="divide-y divide-line rounded-panel border border-line text-xs">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="w-6 shrink-0 text-muted tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{columns.filter(Boolean).slice(0, 3).map((f) => String(r.values[f!.key] ?? '')).join(' · ')}</span>
                    <span className={Object.keys(r.errors).length ? 'text-danger' : 'text-success'}>{Object.keys(r.errors).length ? Object.entries(r.errors).map(([k, m]) => `${fields.find((f) => f.key === k)?.label}: ${m}`).join('; ') : 'OK'}</span>
                  </li>
                ))}
                {rows.length > 8 && <li className="px-3 py-2 text-muted">dan {rows.length - 8} baris lainnya</li>}
              </ul>
            </>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant="accent" loading={busy} disabled={!valid.length} onClick={run}>
            Impor {valid.length} baris
          </Button>
        </footer>
      </div>
    </div>
  )
}
