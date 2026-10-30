import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { CheckCheck, CornerDownLeft, FileText, History, Plus, Search, TerminalSquare, type LucideIcon } from 'lucide-react'
import { RECORD_TYPES, typeOf } from '@/domain/catalog'
import { findByTcode, searchMenu } from '@/domain/menu'
import { canCreate } from '@/domain/records'
import { search, type SearchDoc } from '@/domain/search'
import { cn } from '@/lib/cn'
import { useMenu } from '../../hooks/useMenu'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useSession } from '../../hooks/useSession'
import { useRecordDrawer } from '../../records/drawer'
import { fieldText, recordTitle } from '../../records/text'
import { PaletteContext } from './palette'

interface Item {
  key: string
  group: string
  icon: LucideIcon
  label: string
  hint?: string
  run: () => void
}

interface Doc extends SearchDoc {
  type: string
  typeName: string
}

const RECENT = 'satona-recent'
type Recent = { type: string; id: string; title: string }

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]') as Recent[]
  } catch {
    return []
  }
}

function remember(r: Recent) {
  try {
    localStorage.setItem(RECENT, JSON.stringify([r, ...readRecent().filter((x) => !(x.type === r.type && x.id === r.id))].slice(0, 6)))
  } catch {
    // Blocked storage: recent items last for this visit only.
  }
}

const CREATE_WORDS = /^(new|create|add|buat|tambah)\s+/i

function Palette({ initial, onClose }: { initial: string; onClose: () => void }) {
  const navigate = useNavigate()
  const openRecord = useRecordDrawer()
  const accessFor = useAccess()
  const all = useAllRecords()
  const { tree, approvals } = useMenu()
  const { role } = useSession()
  const [q, setQ] = useState(initial)
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const docs = useMemo<Doc[]>(() => {
    if (!all.data) return []
    return RECORD_TYPES.filter((t) => accessFor(t.module) !== 'none').flatMap((t) =>
      (all.data![t.key] ?? []).map((r) => ({
        id: r.id,
        type: t.key,
        typeName: t.singular,
        title: recordTitle(t, r, all.data),
        text: `${t.name} ${t.fields.filter((f) => f.list).map((f) => fieldText(f, r.values[f.key], all.data)).join(' ')}`,
      })),
    )
  }, [all.data, accessFor])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const query = q.trim()
    const view = (type: string, id: string, title: string) => () => {
      remember({ type, id, title })
      onClose()
      openRecord({ mode: 'view', type, id })
    }
    const go = (to: string) => () => {
      onClose()
      navigate(to)
    }
    const exact = findByTcode(tree, query)
    if (exact?.to) out.push({ key: `t-${exact.id}`, group: 'Transaction', icon: TerminalSquare, label: exact.label, hint: exact.tcode, run: go(exact.to) })

    const words = query.replace(CREATE_WORDS, '').toLowerCase()
    const creatable = RECORD_TYPES.filter((t) => canCreate(t, accessFor(t.module)))
    const creates = query
      ? creatable.filter((t) => words && (t.singular.toLowerCase().includes(words) || t.name.toLowerCase().includes(words))).slice(0, CREATE_WORDS.test(query) ? 6 : 3)
      : creatable.filter((t) => t.module === role.module && t.area === 'transaction').slice(0, 4)
    for (const t of creates) out.push({ key: `c-${t.key}`, group: 'Create', icon: Plus, label: `New ${t.singular.toLowerCase()}`, hint: t.module.toUpperCase(), run: () => (onClose(), openRecord({ mode: 'create', type: t.key })) })

    if (!query) {
      for (const r of readRecent()) if (typeOf(r.type)) out.push({ key: `r-${r.type}-${r.id}`, group: 'Recent', icon: History, label: r.title, hint: r.id, run: view(r.type, r.id, r.title) })
      if (approvals) out.push({ key: 'approvals', group: 'Go to', icon: CheckCheck, label: `My approvals (${approvals})`, run: go('/approvals') })
      return out
    }
    if (!CREATE_WORDS.test(query) && query.length >= 2)
      for (const d of search(docs, query, 8)) out.push({ key: `d-${d.type}-${d.id}`, group: 'Records', icon: FileText, label: d.title, hint: `${d.typeName} · ${d.id}`, run: view(d.type, d.id, d.title) })
    for (const n of searchMenu(tree, query, 6)) if (n.to && n.id !== exact?.id) out.push({ key: `m-${n.id}`, group: 'Menu', icon: TerminalSquare, label: n.label, hint: n.tcode, run: go(n.to) })
    return out
  }, [q, tree, docs, accessFor, role.module, approvals, navigate, onClose, openRecord])

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => back?.focus()
  }, [])
  useEffect(() => {
    document.getElementById(`palette-${index}`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[index]?.run()
    }
  }

  let group = ''
  return (
    <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-[950] flex items-start justify-center p-3 pt-[10vh]">
      <button type="button" aria-label="Close search" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-xl animate-rise flex-col overflow-hidden rounded-card border border-line bg-card shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden className="size-5 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? `palette-${index}` : undefined}
            aria-label="Search records, menus and transaction codes"
            placeholder="Find a record, a menu or a T-code. Try “new permit”"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.map((it, i) => {
            const heading = it.group !== group
            group = it.group
            return (
              <li key={it.key} role="presentation">
                {heading && <p className="eyebrow px-2.5 pt-2 pb-1">{it.group}</p>}
                <button
                  type="button"
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={it.run}
                  className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm', i === index ? 'bg-raised text-fg' : 'text-body')}
                >
                  <it.icon aria-hidden className={cn('size-4 shrink-0', it.group === 'Create' ? 'text-accent-text' : 'text-muted')} />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="shrink-0 font-mono text-[11px] text-muted">{it.hint}</span>}
                  {i === index && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-subtle" />}
                </button>
              </li>
            )
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”. Try a record number, a name or a T-code.</li>}
        </ul>
        <p className="hidden border-t border-line px-4 py-2 text-[11px] text-muted sm:block">↑↓ to move · Enter to open · ⌘K or / from anywhere</p>
      </div>
    </div>
  )
}

/** Global search: ⌘K, Ctrl+K or / opens it from any screen. */
export function CommandPalette({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const show = useCallback((query = '') => setOpen(query), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <PaletteContext.Provider value={show}>
      {children}
      {open !== null && <Palette initial={open} onClose={close} />}
    </PaletteContext.Provider>
  )
}
