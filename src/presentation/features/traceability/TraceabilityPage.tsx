import { Link } from 'react-router'
import { ArrowUpRight, Search } from 'lucide-react'
import { countBy } from '@/domain/erp'
import { LOT_LABEL, type LotState } from '@/domain/ops'
import { count } from '@/lib/format'
import { useQueryState } from '../../hooks/useParams'
import { useRecordList } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { StatusPill } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { LOT_TONE } from '../entityStyle'

const STATES = (Object.keys(LOT_LABEL) as LotState[]).map((value) => ({ value, label: LOT_LABEL[value] }))

export default function TraceabilityPage() {
  const { ops } = useServices()
  const lots = useResource('ops.lots', () => ops.lots())
  const lotRecords = useRecordList('gtr.lots')
  const [query, setQuery] = useQueryState(['state', 'q'] as const)
  const state = query.state as LotState | undefined

  if (!lots.data) return <CardSkeleton lines={6} />
  const stateOf = (id: string) => (lotRecords.data?.find((r) => r.values.lotNo === id)?.status as LotState | undefined) ?? lots.data?.find((l) => l.id === id)?.state ?? 'released'
  const needle = query.q?.trim().toLowerCase()
  const bySearch = lots.data.filter((l) => !needle || [l.id, l.product, ...l.nodes.map((n) => n.label)].some((s) => s.toLowerCase().includes(needle)))
  const rows = bySearch.filter((l) => !state || stateOf(l.id) === state)
  const clear = () => setQuery({ state: undefined, q: undefined })

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <FilterChips label="Filter by lot state" options={STATES} value={state} counts={countBy(bySearch, (l) => stateOf(l.id))} total={bySearch.length} onChange={(v) => setQuery({ state: v })} />
        <Input
          className="h-10 w-full sm:w-72"
          icon={<Search className="size-4" />}
          placeholder="Lot, product, vendor lot, plate, customer"
          aria-label="Search lots"
          value={query.q ?? ''}
          onChange={(e) => setQuery({ q: e.target.value })}
        />
        {(state || query.q) && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No lot matches" action={<Button variant="solid" size="sm" onClick={clear}>Clear filters</Button>}>
            Search by a vendor lot or a truck plate to find every lot it touched.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((l) => (
            <li key={l.id} data-motion="row">
              <Link to={`/traceability/${l.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-raised">
                <span className="w-full font-mono text-xs font-semibold sm:w-56">{l.id}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{l.product}</span>
                <span className="text-xs text-muted tabular">
                  {l.produced} · {count(l.qty)} t · {l.nodes.filter((n) => n.stage === 'customer').length} customers
                </span>
                <StatusPill tone={LOT_TONE[stateOf(l.id)]}>{LOT_LABEL[stateOf(l.id)]}</StatusPill>
                <ArrowUpRight aria-hidden className="size-4 text-subtle group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
