import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Siren } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { LOT_LABEL, STAGE_LABEL, STAGES, traceFrom, type LotState, type TraceNode } from '@/domain/ops'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { useRecordList } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StatusPill } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Fallback } from '../../ui/Gate'
import { FactGrid, Headline } from '../../ui/Headline'
import { PageBar } from '../../ui/PageBar'
import { useToast } from '../../ui/useToast'
import { recordPath } from '../../records/text'
import { LOT_TONE } from '../entityStyle'

const W = 1000
const COL = W / STAGES.length
const NODE_W = 160
const NODE_H = 54
const GAP = 22

export default function LotPage() {
  const { id = '' } = useParams()
  const { ops, records } = useServices()
  const toast = useToast()
  const { role } = useSession()
  const lot = useResource(`ops.lot:${id}`, () => ops.lot(id), { keepPrevious: false })
  const [focus, setFocus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lotRecords = useRecordList('gtr.lots')

  const l = lot.data
  if (!l) return <Fallback error={lot.error} onRetry={lot.reload} back={{ to: '/traceability', label: 'Back to traceability' }} what="lot" />

  const columns = STAGES.map((stage) => l.nodes.filter((n) => n.stage === stage))
  const rows = Math.max(...columns.map((c) => c.length))
  const H = rows * (NODE_H + GAP) + GAP
  const pos = new Map<string, { x: number; y: number }>()
  columns.forEach((col, ci) => {
    const top = (H - col.length * (NODE_H + GAP) + GAP) / 2
    col.forEach((n, ri) => pos.set(n.id, { x: ci * COL + (COL - NODE_W) / 2, y: top + ri * (NODE_H + GAP) }))
  })
  const lit = focus ? traceFrom(l, focus) : null
  const lotRecord = lotRecords.data?.find((r) => r.values.lotNo === l.id)
  const state = (lotRecord?.status as LotState | undefined) ?? l.state
  const recalled = state === 'recalled'
  const lotType = typeOf('gtr.lots')
  const customers = l.nodes.filter((n) => n.stage === 'customer')
  const affected = lit ? customers.filter((c) => lit.has(c.id)) : customers
  const picked = l.nodes.find((n) => n.id === focus)

  /** Opens a GTR recall record for the traced customers and moves the lot to Recalled; both follow the role's access. */
  async function startRecall() {
    if (!lotRecord) return
    setBusy(true)
    setFocus(focus ?? 'reactor')
    try {
      const recall = await records.create(role, 'gtr.recalls', { lot: lotRecord.id, reason: `Rapid recall of ${lotRecord.values.lotNo} (${lotRecord.values.product}) from the genealogy view.`, customers: affected.length })
      await records.transition(role, 'gtr.lots', lotRecord.id, 'recalled')
      toast({ tone: 'danger', title: `Recall ${recall.id} opened for ${affected.length} customers`, description: 'The Recall Task Force sees it under GTR, Recalls.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Recall not opened', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const nodeClass = (n: TraceNode) => {
    const on = !lit || lit.has(n.id)
    if (!on) return 'opacity-25'
    if (recalled && (n.stage === 'customer' || n.stage === 'truck')) return 'recall'
    return n.id === focus ? 'focus' : ''
  }

  return (
    <div className="space-y-4">
      <PageBar
        fallback="/traceability"
        label="Traceability"
        actions={
          !recalled && (
            <Button variant="accent" loading={busy} onClick={startRecall}>
              <Siren aria-hidden className="size-4" /> Start rapid recall
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LOT_TONE[state]}>{LOT_LABEL[state]}</StatusPill>
            {lotRecord && lotType && (
              <Link to={recordPath(lotType, lotRecord.id)} className="text-xs text-muted hover:text-fg hover:underline">
                GTR record {lotRecord.id}
              </Link>
            )}
          </div>
          <p className="mt-3 font-mono text-xs text-muted">{l.id}</p>
          <Headline>{l.product}</Headline>
          <FactGrid
            className="mt-4 grid-cols-2"
            facts={[
              ['Produced', l.produced],
              ['Quantity', `${count(l.qty)} t`],
              ['Shipments', String(l.nodes.filter((n) => n.stage === 'truck').length)],
              ['Customers', String(customers.length)],
            ]}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={picked ? `${STAGE_LABEL[picked.stage]}: ${picked.label}` : 'Pick a node'} />
          {picked ? (
            <p className="text-sm text-body">
              {picked.detail}. Tracing from here reaches {lit ? lit.size - 1 : 0} linked records, including{' '}
              <span className="font-semibold text-fg">{affected.length} customers</span>: {affected.map((c) => c.label).join(', ')}.
            </p>
          ) : (
            <p className="text-sm text-body">Click any node in the genealogy to light up everything upstream and downstream of it. A vendor lot shows every customer it reached; a customer shows every vendor lot behind its delivery.</p>
          )}
          {focus && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFocus(null)}>
              Clear trace
            </Button>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Batch genealogy" action={<span className="text-xs text-muted">Vendor lot → tank → reactor → truck → customer</span>} />
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H + 30}`} className="min-w-[760px]" role="group" aria-label={`Genealogy of lot ${l.id}`}>
            {STAGES.map((s, i) => (
              <text key={s} x={i * COL + COL / 2} y={14} textAnchor="middle" className="fill-subtle text-[12px] font-semibold tracking-wider uppercase">
                {STAGE_LABEL[s]}
              </text>
            ))}
            <g transform="translate(0 26)">
              {l.links.map(([from, to]) => {
                const a = pos.get(from)
                const b = pos.get(to)
                if (!a || !b) return null
                const x1 = a.x + NODE_W
                const y1 = a.y + NODE_H / 2
                const x2 = b.x
                const y2 = b.y + NODE_H / 2
                const on = !lit || (lit.has(from) && lit.has(to))
                const hot = recalled && on
                return (
                  <path
                    key={`${from}-${to}`}
                    d={`M${x1} ${y1} C${x1 + 40} ${y1} ${x2 - 40} ${y2} ${x2} ${y2}`}
                    fill="none"
                    strokeWidth={on ? 2 : 1.5}
                    className={cn('transition-opacity duration-300', on ? 'animate-flow' : 'opacity-20', hot ? 'stroke-accent' : 'stroke-fg/50')}
                  />
                )
              })}
              {l.nodes.map((n) => {
                const p = pos.get(n.id)
                if (!p) return null
                const look = nodeClass(n)
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={focus === n.id}
                    aria-label={`${STAGE_LABEL[n.stage]} ${n.label}`}
                    onClick={() => setFocus(focus === n.id ? null : n.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setFocus(focus === n.id ? null : n.id))}
                    className={cn('cursor-pointer transition-opacity duration-300 outline-none [&:focus-visible>rect]:stroke-accent', look === 'opacity-25' && 'opacity-25')}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={14}
                      strokeWidth={2}
                      className={cn(
                        'transition-colors duration-300',
                        look === 'recall' ? 'fill-accent-soft stroke-accent' : look === 'focus' ? 'fill-invert stroke-invert' : 'fill-raised stroke-line-strong hover:fill-control',
                      )}
                    />
                    <text x={14} y={23} className={cn('text-[13px] font-semibold', look === 'focus' ? 'fill-on-invert' : look === 'recall' ? 'fill-accent-text' : 'fill-fg')}>
                      {n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}
                    </text>
                    <text x={14} y={41} className={cn('text-[11px]', look === 'focus' ? 'fill-on-invert/70' : 'fill-muted')}>
                      {n.detail.length > 24 ? `${n.detail.slice(0, 23)}…` : n.detail}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </Card>
    </div>
  )
}
