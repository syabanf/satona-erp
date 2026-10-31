import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, CalendarRange, ChevronLeft, ChevronRight, Download, Eye, Search, SlidersHorizontal, X } from 'lucide-react'
import { dateFieldOf } from '@/domain/calendar'
import { typeOf } from '@/domain/catalog'
import { applyWhere, parseWhere, serializeWhere } from '@/domain/filters'
import { mappable } from '@/domain/geo'
import { filterRecords, recordDate, sortRecords, type ErpRecord, type RecordType } from '@/domain/records'
import { cn } from '@/lib/cn'
import { toCsv } from '@/lib/csv'
import { useQueryState } from '../hooks/useParams'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { FilterChips } from '../ui/FilterChips'
import { Skeleton, EmptyState } from '../ui/States'
import { Tabs } from '../ui/Tabs'
import { BulkBar } from './BulkBar'
import { RecordCalendar } from './RecordCalendar'
import { FieldFilters, FilterTags } from './FieldFilters'
import { useRecordDrawer } from './drawer'
import { StateBadge } from './StateBadge'
import { ENTITY_NAME, fieldText, recordPath, recordTitle, type AllRecords } from './text'

const PAGE = 20
// Leaflet stays out of the list chunk until someone opens the map view.
const RecordMap = lazy(() => import('./RecordMap').then((m) => ({ default: m.RecordMap })))
const KEYS = ['status', 'q', 'f', 'w', 'sort', 'dir', 'page', 'from', 'to', 'view'] as const
type View = 'table' | 'calendar' | 'map'

/** Every record list: status chips with counts, a filter on every field, search, sort and pages, all in the URL. */
export function RecordTable({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all?: AllRecords }) {
  const navigate = useNavigate()
  const open = useRecordDrawer()
  const [query, setQuery] = useQueryState(KEYS)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [panel, setPanel] = useState(false)
  const where = useMemo(() => parseWhere(query.w), [query.w])
  const views = useMemo(() => {
    const out: Array<{ value: View; label: string }> = [{ value: 'table', label: 'Tabel' }]
    if (dateFieldOf(type)) out.push({ value: 'calendar', label: 'Kalender' })
    if (all && mappable(type, all, typeOf)) out.push({ value: 'map', label: 'Peta' })
    return out
  }, [type, all])
  const view: View = views.some((v) => v.value === query.view) ? (query.view as View) : 'table'
  const setWhere = (key: string, value: string | undefined) => setQuery({ w: serializeWhere({ ...where, [key]: value ?? '' }), page: undefined })
  const columns = type.fields.filter((f) => f.list).slice(0, 5)
  const picker = type.fields.find((f) => f.key === type.insight.groupBy && (f.type === 'select' || f.type === 'entity')) ?? type.fields.find((f) => f.type === 'select' || f.type === 'entity')
  const base = useMemo(() => {
    const inPeriod = query.from || query.to ? rows.filter((r) => (!query.from || recordDate(type, r) >= query.from) && (!query.to || recordDate(type, r) <= query.to)) : rows
    return applyWhere(type, filterRecords(inPeriod, { q: query.q, where: picker ? { [picker.key]: query.f } : {} }), where)
  }, [rows, query.q, query.f, query.from, query.to, picker, type, where])
  const shown = useMemo(
    () => sortRecords(filterRecords(base, { status: query.status }), query.sort ?? 'id', query.dir === 'asc' ? 'asc' : query.sort ? 'asc' : 'desc'),
    [base, query.status, query.sort, query.dir],
  )
  const counts = Object.fromEntries(type.workflow.states.map((s) => [s.id, base.filter((r) => r.status === s.id).length]))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1))
  const slice = shown.slice((page - 1) * PAGE, page * PAGE)
  const fieldCount = Object.keys(where).length
  const active = Boolean(query.status || query.q || query.f || query.from || query.to || fieldCount)
  const clear = () => setQuery({ status: undefined, q: undefined, f: undefined, w: undefined, from: undefined, to: undefined, page: undefined })
  // Selection only keeps rows still on screen, so a filter change drops what it hides.
  const selected = shown.filter((r) => picked.has(r.id))
  const allOnPage = slice.length > 0 && slice.every((r) => picked.has(r.id))
  const toggle = (ids: readonly string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  function exportCsv(list: readonly ErpRecord[]) {
    const head = ['ID', 'Status', ...type.fields.map((f) => f.label)]
    const body = list.map((r) => [r.id, type.workflow.states.find((s) => s.id === r.status)?.label ?? r.status, ...type.fields.map((f) => fieldText(f, r.values[f.key], all))])
    const url = URL.createObjectURL(new Blob([`\uFEFF${toCsv([head, ...body])}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${type.key.replace('.', '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function sortBy(key: string) {
    const same = query.sort === key
    setQuery({ sort: key, dir: same && query.dir !== 'desc' ? 'desc' : 'asc', page: undefined })
  }

  const header = (key: string, label: string, className?: string) => {
    const on = query.sort === key
    const Icon = query.dir === 'desc' ? ArrowDown : ArrowUp
    return (
      <th key={key} className={cn('px-3 py-3 font-medium', className)} aria-sort={on ? (query.dir === 'desc' ? 'descending' : 'ascending') : undefined}>
        <button type="button" onClick={() => sortBy(key)} className="inline-flex cursor-pointer items-center gap-1 hover:text-fg">
          {label}
          {on && <Icon aria-hidden className="size-3" />}
        </button>
      </th>
    )
  }

  return (
    <div id="record-table" data-tour="record-table" className="scroll-mt-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div data-tour="record-status" className="min-w-0">
          <FilterChips
            label="Filter by status"
            options={type.workflow.states.map((s) => ({ value: s.id, label: s.label }))}
            value={query.status}
            counts={counts}
            total={base.length}
            onChange={(v) => setQuery({ status: v, page: undefined })}
          />
        </div>
        {picker && (
          <Select
            compact
            aria-label={`Filter by ${picker.label.toLowerCase()}`}
            value={query.f ?? ''}
            onChange={(e) => setQuery({ f: e.target.value || undefined, page: undefined })}
            options={[{ value: '', label: `All ${picker.label.toLowerCase()}` }, ...(picker.options ?? []).map((o) => ({ value: o, label: picker.type === 'entity' ? (ENTITY_NAME[o] ?? o) : o }))]}
          />
        )}
        <Input
          className="h-10 w-full sm:w-64"
          icon={<Search className="size-4" />}
          placeholder={`Search ${type.name.toLowerCase()}`}
          data-tour="record-search"
          aria-label={`Search ${type.name.toLowerCase()}`}
          value={query.q ?? ''}
          onChange={(e) => setQuery({ q: e.target.value, page: undefined })}
        />
        <Button data-tour="record-filters" variant={panel ? 'solid' : 'card'} size="sm" aria-expanded={panel} aria-controls="field-filters" onClick={() => setPanel((p) => !p)}>
          <SlidersHorizontal aria-hidden className="size-4" /> Filters
          {fieldCount > 0 && <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-semibold text-white tabular">{fieldCount}</span>}
        </Button>
        <FilterTags type={type} rows={rows} all={all} where={where} onChange={setWhere} />
        {(query.from || query.to) && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-invert pr-1 pl-3 text-xs font-medium text-on-invert tabular">
            <CalendarRange aria-hidden className="size-3.5" />
            {query.from === query.to ? query.from : `${query.from ?? '…'} to ${query.to ?? '…'}`}
            <button type="button" aria-label="Clear period" onClick={() => setQuery({ from: undefined, to: undefined, page: undefined })} className="grid size-6 cursor-pointer place-items-center rounded-full hover:bg-white/15">
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        )}
        {active && (
          <>
            <span className="text-xs text-muted tabular">
              {shown.length} of {rows.length}
            </span>
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear filters
            </Button>
          </>
        )}
        <Button variant="card" size="sm" className="ml-auto" onClick={() => exportCsv(shown)} disabled={!shown.length}>
          <Download aria-hidden className="size-4" /> Export CSV
        </Button>
        <p className="sr-only" aria-live="polite">
          {shown.length} results
        </p>
      </div>

      {panel && (
        <div id="field-filters">
          <FieldFilters type={type} rows={rows} all={all} where={where} onChange={setWhere} />
        </div>
      )}

      {views.length > 1 && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Tabs label="Tampilan" options={views} value={view} onChange={(v) => setQuery({ view: v === 'table' ? undefined : v })} />
          {view !== 'table' && <span className="text-xs text-muted tabular">{shown.length} data sesuai filter</span>}
        </div>
      )}

      {view === 'calendar' && (
        <div className="p-4">
          <RecordCalendar type={type} rows={shown} all={all ?? {}} />
        </div>
      )}
      {view === 'map' && all && (
        <div className="p-4">
          <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
            <RecordMap type={type} rows={shown} all={all} />
          </Suspense>
        </div>
      )}

      {view === 'table' && selected.length > 0 && <BulkBar type={type} rows={selected} onExport={() => exportCsv(selected)} onClear={() => setPicked(new Set())} />}

      {view !== 'table' ? null : shown.length === 0 ? (
        <div className="p-6">
          {active ? (
            <EmptyState title={`No ${type.singular.toLowerCase()} matches`} action={<Button variant="solid" size="sm" onClick={clear}>Clear filters</Button>}>
              Try another word or status.
            </EmptyState>
          ) : (
            <EmptyState title={`No ${type.name.toLowerCase()} yet`}>Create the first one with the New button.</EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="w-10 py-3 pl-5">
                    <input type="checkbox" aria-label="Select every row on this page" checked={allOnPage} onChange={(e) => toggle(slice.map((r) => r.id), e.target.checked)} className="size-4 cursor-pointer accent-[var(--color-accent)]" />
                  </th>
                  {header('id', 'ID')}
                  {columns.map((f) => header(f.key, f.label))}
                  {header('status', 'Status')}
                  <th className="pr-5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice.map((r) => (
                  <tr key={r.id} data-motion="row" onClick={() => navigate(recordPath(type, r.id))} className={cn('cursor-pointer transition-colors hover:bg-raised', picked.has(r.id) && 'bg-accent-soft/60')}>
                    <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.id}`} checked={picked.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} className="size-4 cursor-pointer accent-[var(--color-accent)]" />
                    </td>
                    <td className="py-3 pr-3 pl-3 whitespace-nowrap">
                      <Link to={recordPath(type, r.id)} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-semibold hover:underline">
                        {r.id}
                      </Link>
                    </td>
                    {columns.map((f) => (
                      <td key={f.key} className={cn('max-w-64 truncate px-3 py-3', f.type === 'number' || f.type === 'money' || f.unit ? 'tabular' : '', f.key === type.titleField && 'font-medium')}>
                        {fieldText(f, r.values[f.key], all)}
                      </td>
                    ))}
                    <td className="py-3 pl-3">
                      <StateBadge type={type} status={r.status} />
                    </td>
                    <td className="py-3 pr-5 pl-2 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Quick view ${r.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          open({ mode: 'view', type: type.key, id: r.id })
                        }}
                      >
                        <Eye aria-hidden className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {slice.map((r) => (
              <li key={r.id} data-motion="row">
                <Link to={recordPath(type, r.id)} className="block p-4">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{r.id}</span>
                    <StateBadge type={type} status={r.status} />
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold">{recordTitle(type, r, all)}</span>
                  <span className="block truncate text-xs text-muted">
                    {columns
                      .filter((f) => f.key !== type.titleField)
                      .slice(0, 2)
                      .map((f) => fieldText(f, r.values[f.key], all))
                      .join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
              <span className="tabular">
                {(page - 1) * PAGE + 1} to {Math.min(page * PAGE, shown.length)} of {shown.length}
              </span>
              <div className="flex gap-1">
                <Button variant="soft" size="icon-sm" aria-label="Previous page" disabled={page === 1} onClick={() => setQuery({ page: String(page - 1) })}>
                  <ChevronLeft aria-hidden className="size-4" />
                </Button>
                <Button variant="soft" size="icon-sm" aria-label="Next page" disabled={page === pages} onClick={() => setQuery({ page: String(page + 1) })}>
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
