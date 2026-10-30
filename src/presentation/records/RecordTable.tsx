import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { filterRecords, sortRecords, type ErpRecord, type RecordType } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useQueryState } from '../hooks/useParams'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { FilterChips } from '../ui/FilterChips'
import { EmptyState } from '../ui/States'
import { StateBadge } from './StateBadge'
import { ENTITY_NAME, fieldText, recordPath, recordTitle, type AllRecords } from './text'

const PAGE = 20
const KEYS = ['status', 'q', 'f', 'sort', 'dir', 'page'] as const

/** Every record list: status chips with counts, a picker for the main category field, search, sort and pages, all in the URL. */
export function RecordTable({ type, rows, all }: { type: RecordType; rows: readonly ErpRecord[]; all?: AllRecords }) {
  const navigate = useNavigate()
  const [query, setQuery] = useQueryState(KEYS)
  const columns = type.fields.filter((f) => f.list).slice(0, 5)
  const picker = type.fields.find((f) => f.key === type.insight.groupBy && (f.type === 'select' || f.type === 'entity')) ?? type.fields.find((f) => f.type === 'select' || f.type === 'entity')
  const base = useMemo(() => filterRecords(rows, { q: query.q, where: picker ? { [picker.key]: query.f } : {} }), [rows, query.q, query.f, picker])
  const shown = useMemo(
    () => sortRecords(filterRecords(base, { status: query.status }), query.sort ?? 'id', query.dir === 'asc' ? 'asc' : query.sort ? 'asc' : 'desc'),
    [base, query.status, query.sort, query.dir],
  )
  const counts = Object.fromEntries(type.workflow.states.map((s) => [s.id, base.filter((r) => r.status === s.id).length]))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const page = Math.min(pages, Math.max(1, Number(query.page) || 1))
  const slice = shown.slice((page - 1) * PAGE, page * PAGE)
  const active = Boolean(query.status || query.q || query.f)
  const clear = () => setQuery({ status: undefined, q: undefined, f: undefined, page: undefined })

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
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <FilterChips
          label="Filter by status"
          options={type.workflow.states.map((s) => ({ value: s.id, label: s.label }))}
          value={query.status}
          counts={counts}
          total={base.length}
          onChange={(v) => setQuery({ status: v, page: undefined })}
        />
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
          aria-label={`Search ${type.name.toLowerCase()}`}
          value={query.q ?? ''}
          onChange={(e) => setQuery({ q: e.target.value, page: undefined })}
        />
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
        <p className="sr-only" aria-live="polite">
          {shown.length} results
        </p>
      </div>

      {shown.length === 0 ? (
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
                  {header('id', 'ID', 'pl-5')}
                  {columns.map((f) => header(f.key, f.label))}
                  {header('status', 'Status', 'pr-5')}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice.map((r) => (
                  <tr key={r.id} data-motion="row" onClick={() => navigate(recordPath(type, r.id))} className="cursor-pointer transition-colors hover:bg-raised">
                    <td className="py-3 pr-3 pl-5 whitespace-nowrap">
                      <Link to={recordPath(type, r.id)} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-semibold hover:underline">
                        {r.id}
                      </Link>
                    </td>
                    {columns.map((f) => (
                      <td key={f.key} className={cn('max-w-64 truncate px-3 py-3', f.type === 'number' || f.type === 'money' || f.unit ? 'tabular' : '', f.key === type.titleField && 'font-medium')}>
                        {fieldText(f, r.values[f.key], all)}
                      </td>
                    ))}
                    <td className="py-3 pr-5 pl-3">
                      <StateBadge type={type} status={r.status} />
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
