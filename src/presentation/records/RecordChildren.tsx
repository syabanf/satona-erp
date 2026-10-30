import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Network, Plus, Search } from 'lucide-react'
import { RECORD_TYPES } from '@/domain/catalog'
import { canCreate, childTypes, descendants, filterRecords, rollup, type ErpRecord, type RecordType, type TreeNode } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count, moneyCompact } from '@/lib/format'
import { useAccess } from '../hooks/useRecords'
import { buttonStyles } from '../ui/buttonStyles'
import { Card } from '../ui/Card'
import { Input } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { StateBadge } from './StateBadge'
import { fieldText, recordPath, recordTitle, type AllRecords } from './text'

const sumText = (v: number, money: boolean, unit?: string) => (money ? moneyCompact(v) : `${count(Math.round(v * 10) / 10)}${unit ? ` ${unit}` : ''}`)

function Tree({ nodes, all, depth = 0 }: { nodes: readonly TreeNode[]; all: AllRecords; depth?: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(depth === 0 ? nodes.slice(0, 3).map((n) => n.record.id) : []))
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} className={cn(depth > 0 && 'ml-5 border-l border-line pl-3')}>
      {nodes.map((n) => {
        const isOpen = open.has(n.record.id)
        const measure = n.type.fields.find((f) => f.list && (f.type === 'number' || f.type === 'money' || (f.type === 'computed' && f.unit)))
        return (
          <li key={`${n.type.key}-${n.record.id}`} role="treeitem" aria-expanded={n.children.length ? isOpen : undefined} aria-selected={false} className="animate-rise">
            <div className="flex items-center gap-2 rounded-xl py-1.5 pr-2 hover:bg-raised">
              {n.children.length ? (
                <button
                  type="button"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  onClick={() => setOpen((s) => {
                    const next = new Set(s)
                    if (next.has(n.record.id)) next.delete(n.record.id)
                    else next.add(n.record.id)
                    return next
                  })}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-control"
                >
                  <ChevronRight aria-hidden className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />
                </button>
              ) : (
                <span className="size-6 shrink-0" />
              )}
              <span className="eyebrow w-24 shrink-0 truncate">{n.type.singular}</span>
              <Link to={recordPath(n.type, n.record.id)} className="min-w-0 flex-1 truncate text-sm hover:underline">
                <span className="font-mono text-xs text-muted">{n.record.id}</span> <span className="font-medium">{recordTitle(n.type, n.record, all)}</span>
              </Link>
              {n.children.length > 0 && <span className="hidden text-xs text-muted tabular sm:inline">{n.children.length} below</span>}
              {measure && <span className="hidden w-20 text-right text-xs tabular sm:inline">{fieldText(measure, n.record.values[measure.key], all)}</span>}
              <StateBadge type={n.type} status={n.record.status} />
            </div>
            {isOpen && n.children.length > 0 && <Tree nodes={n.children} all={all} depth={depth + 1} />}
          </li>
        )
      })}
    </ul>
  )
}

function ChildTable({ type, field, parent, rows, all }: { type: RecordType; field: string; parent: ErpRecord; rows: readonly ErpRecord[]; all: AllRecords }) {
  const accessFor = useAccess()
  const [q, setQ] = useState('')
  const shown = filterRecords(rows, { q })
  const columns = type.fields.filter((f) => f.list && f.key !== field).slice(0, 4)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 py-3">
        <Input className="h-10 w-full sm:w-64" icon={<Search className="size-4" />} placeholder={`Search ${type.name.toLowerCase()}`} aria-label={`Search ${type.name.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted tabular">
          {shown.length} of {rows.length}
        </span>
        {canCreate(type, accessFor(type.module)) && (
          <Link to={`${recordPath(type)}/new?${field}=${encodeURIComponent(parent.id)}`} className={buttonStyles({ variant: 'solid', size: 'sm', className: 'ml-auto' })}>
            <Plus aria-hidden className="size-3.5" /> Add {type.singular.toLowerCase()}
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-3 font-medium">ID</th>
              {columns.map((f) => (
                <th key={f.key} className="px-3 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="py-2 pl-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.slice(0, 50).map((r) => (
              <tr key={r.id} className="hover:bg-raised">
                <td className="py-2.5 pr-3">
                  <Link to={recordPath(type, r.id)} className="font-mono text-xs font-semibold hover:underline">
                    {r.id}
                  </Link>
                </td>
                {columns.map((f) => (
                  <td key={f.key} className="max-w-56 truncate px-3 py-2.5">
                    {fieldText(f, r.values[f.key], all)}
                  </td>
                ))}
                <td className="py-2.5 pl-3">
                  <StateBadge type={type} status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-4 text-sm text-muted">No {type.name.toLowerCase()} under this record yet.</p>}
    </div>
  )
}

/** Everything filed under a record: roll-up tiles, the structure tree, and one table per child type with Add. */
export function RecordChildren({ type, record, all }: { type: RecordType; record: ErpRecord; all: AllRecords }) {
  const kids = useMemo(() => childTypes(type.key, RECORD_TYPES), [type.key])
  const tree = useMemo(() => descendants(type, record, RECORD_TYPES, all, 3), [type, record, all])
  const totals = useMemo(() => rollup(tree), [tree])
  const [tab, setTab] = useState('tree')
  if (!kids.length) return null

  const options = [{ value: 'tree', label: 'Structure' }, ...kids.map((k) => ({ value: k.type.key, label: `${k.type.name} (${(all[k.type.key] ?? []).filter((r) => r.values[k.field.key] === record.id).length})` }))]
  const active = kids.find((k) => k.type.key === tab)

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Network aria-hidden className="size-5 text-muted" />
        <h2 className="text-lg font-semibold">Structure &amp; child records</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {totals.map((t) => (
          <button
            key={t.type.key}
            type="button"
            onClick={() => kids.some((k) => k.type.key === t.type.key) && setTab(t.type.key)}
            className="rounded-panel bg-raised p-3 text-left transition-colors hover:bg-control"
          >
            <p className="eyebrow truncate">{t.type.name}</p>
            <p className="mt-1 text-xl font-semibold tabular">{count(t.count)}</p>
            {t.field && t.sum > 0 && <p className="truncate text-xs text-muted tabular">{sumText(t.sum, t.field.type === 'money' || t.field.unit === 'Rp', t.field.unit)} {t.field.label.toLowerCase()}</p>}
          </button>
        ))}
      </div>
      <div className="no-scrollbar mt-5 overflow-x-auto">
        <Tabs label="Child records" options={options} value={tab} onChange={setTab} variant="underline" />
      </div>
      {active ? (
        <ChildTable key={active.type.key} type={active.type} field={active.field.key} parent={record} rows={(all[active.type.key] ?? []).filter((r) => r.values[active.field.key] === record.id)} all={all} />
      ) : tree.length ? (
        <div className="mt-3">
          <Tree nodes={tree} all={all} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Nothing is filed under this record yet. Pick a tab above to add the first child.</p>
      )}
    </Card>
  )
}
