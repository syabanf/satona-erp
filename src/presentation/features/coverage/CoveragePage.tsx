import { Link } from 'react-router'
import { ArrowUpRight, Search } from 'lucide-react'
import { useQueryState } from '../../hooks/useParams'
import { Tag } from '../../ui/Badge'
import { Card } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { EmptyState } from '../../ui/States'
import { Button } from '../../ui/Button'
import { GAP_ITEMS, type Entity } from './items'

const ENTITIES: ReadonlyArray<{ value: Entity; label: string }> = [
  { value: 'holding', label: 'Satona holding' },
  { value: 'rotama', label: 'Rotama' },
  { value: 'rodame', label: 'Rodame' },
  { value: 'roasi', label: 'Roasi' },
  { value: 'integration', label: 'Integration layer' },
]
const BEFORE = [
  { value: 'Missing', label: 'Was missing' },
  { value: 'Partial', label: 'Was partial' },
] as const
const countBy = <K extends string>(key: (i: (typeof GAP_ITEMS)[number]) => K) =>
  GAP_ITEMS.reduce<Partial<Record<K, number>>>((acc, i) => ({ ...acc, [key(i)]: (acc[key(i)] ?? 0) + 1 }), {})

/** Every row of the gap analysis with the demo screens that now cover it. */
export default function CoveragePage() {
  const [query, setQuery] = useQueryState(['entity', 'before', 'q'] as const)
  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const rows = GAP_ITEMS.filter(
    (i) =>
      (!query.entity || i.entity === query.entity) &&
      (!query.before || i.before === query.before) &&
      words.every((w) => `${i.no} ${i.module} ${i.scope} ${i.links.map((l) => l[0]).join(' ')}`.toLowerCase().includes(w)),
  )
  const mock = GAP_ITEMS.filter((i) => i.note).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          ['Gap rows', String(GAP_ITEMS.length), 'from the 30 Oct 2026 analysis'],
          ['Covered in the demo', String(GAP_ITEMS.length - mock), 'screens on mock data'],
          ['Configuration only', String(mock), 'integration layer, needs the backend'],
          ['High priority', String(GAP_ITEMS.filter((i) => i.priority === 'High').length), 'all have a screen'],
        ].map(([label, value, note], i) => (
          <div key={label} data-motion="rise" className={i === 0 ? 'rounded-card bg-invert p-5 text-on-invert shadow-card' : 'rounded-card border border-line bg-card p-5 shadow-card'}>
            <p className={i === 0 ? 'text-xs opacity-70' : 'text-xs text-muted'}>{label}</p>
            <p className="mt-2 text-[26px] font-medium tracking-tight tabular">{value}</p>
            <p className={i === 0 ? 'mt-0.5 text-xs opacity-70' : 'mt-0.5 text-xs text-muted'}>{note}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <FilterChips label="Entity" options={ENTITIES} value={query.entity as Entity | undefined} counts={countBy((i) => i.entity)} total={GAP_ITEMS.length} onChange={(v) => setQuery({ entity: v })} className="min-w-0 flex-1" />
          <Input icon={<Search aria-hidden className="size-4" />} value={query.q ?? ''} onChange={(e) => setQuery({ q: e.target.value })} placeholder="Search scope or screen" aria-label="Search the gap rows" className="lg:w-72" />
        </div>
        <FilterChips label="Status before" options={BEFORE} value={query.before as (typeof BEFORE)[number]['value'] | undefined} counts={countBy((i) => i.before)} total={GAP_ITEMS.length} onChange={(v) => setQuery({ before: v })} className="mt-3" />

        {rows.length === 0 ? (
          <EmptyState title="No gap row matches" action={<Button onClick={() => setQuery({ entity: undefined, before: undefined, q: undefined })}>Clear filters</Button>} />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {rows.map((i) => (
              <li key={i.no} data-motion="row" className="grid gap-2 py-3 md:grid-cols-[3rem_1fr_minmax(0,1.3fr)] md:items-start md:gap-4">
                <span className="font-mono text-xs text-muted">#{i.no}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{i.scope}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{i.module}</span>
                    <Tag tone={i.priority === 'High' ? 'accent' : 'neutral'}>{i.priority}</Tag>
                    <Tag tone={i.note ? 'info' : 'success'}>{i.note ? 'Configuration' : 'Covered'}</Tag>
                    <span>was {i.before.toLowerCase()}</span>
                  </p>
                  {i.note && <p className="mt-1 text-xs text-muted">{i.note}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {i.links.map(([label, to]) => (
                    <Link key={to + label} to={to} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-raised px-3 text-xs font-medium text-body transition-colors hover:bg-hover hover:text-fg">
                      {label}
                      <ArrowUpRight aria-hidden className="size-3.5 text-subtle" />
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
