import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { CalendarRange, Gauge } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { shiftDay } from '@/domain/kpi'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { useToast } from '../../ui/useToast'
import { NewButtons } from '../../records/NewButtons'
import { recordPath, refTitle } from '../../records/text'
import { Card, CardHeader } from '../../ui/Card'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'

const t = (key: string) => typeOf(key)!
const DAYS = 14
const BEFORE = 3
const BAR = { scheduled: 'hatch border border-line-strong bg-raised text-fg', running: 'bg-accent text-white shadow-glow', done: 'bg-control text-muted' } as Record<string, string>

/** Puts overlapping jobs of one work centre on separate lanes, so no bar hides another. */
function lanes<J extends { job: ErpRecord; from: number; to: number }>(jobs: readonly J[]) {
  const ends: number[] = []
  return jobs.map((j) => {
    let lane = ends.findIndex((end) => end <= j.from)
    if (lane < 0) lane = ends.push(0) - 1
    ends[lane] = j.to
    return { ...j, lane }
  })
}

/**
 * Scheduling board per work centre with changeovers, and capacity requirement beside it. A slot can be dragged to
 * another day or to another work centre of the same line; the slot record takes the new start and machine.
 */
export default function PlanningBoard() {
  const { clock, records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [dragged, setDragged] = useState<ErpRecord | null>(null)
  const all = useAllRecords()
  const today = clock.today()
  const start = shiftDay(today, -BEFORE)

  const k = useMemo(() => {
    if (!all.data) return null
    const day = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
    const jobs = all.data['mrp.schedule'] ?? []
    const gradeOf = new Map((all.data['bpf.orders'] ?? []).map((o) => [o.id, String(o.values.formula)]))
    const matrix = new Map((all.data['mrp.changeovers'] ?? []).map((c) => [`${String(c.values.from)}>${String(c.values.to)}`, Number(c.values.minutes)]))
    const rows = (all.data['mrp.workcenters'] ?? []).map((wc) => {
      const sorted = jobs
        .filter((j) => j.values.machine === wc.id)
        .map((job) => ({ job, from: day(String(job.values.start)), to: day(String(job.values.start)) + Number(job.values.hours) / 24, setup: Number(job.values.setup) || 0 }))
        .sort((a, b) => a.from - b.from)
      // The changeover matrix gives the setup a job needs after the grade before it on the same machine.
      const mine = sorted
        .map((j, i) => {
          const prev = sorted[i - 1]
          const from = prev && gradeOf.get(String(prev.job.values.order))
          const to = gradeOf.get(String(j.job.values.order))
          return { ...j, matrix: from && to && from !== to ? matrix.get(`${from}>${to}`) : 0 }
        })
        .filter((j) => j.to > 0 && j.from < DAYS)
      // Load over the coming week against the hours its shifts make available.
      const next = mine.filter((j) => j.from >= BEFORE && j.from < BEFORE + 7)
      const setup = next.reduce((s, j) => s + j.setup, 0) / 60
      const week = next.reduce((s, j) => s + Number(j.job.values.hours), 0) + setup
      const available = (Number(wc.values.shifts) || 1) * 8 * 7
      return { wc, jobs: lanes(mine.map((j) => ({ ...j, from: j.from - j.setup / 1440 }))), week, setup, available, load: week / available }
    })
    return { rows, bottleneck: [...rows].sort((a, b) => b.load - a.load)[0] }
  }, [all.data, start])

  if (!k || !all.data) return <CardSkeleton lines={8} />
  const list = (key: string, query = '') => `${recordPath(t(key))}${query}`
  const scheduled = k.rows.reduce((s, r) => s + r.week, 0)
  const capacity = k.rows.reduce((s, r) => s + r.available, 0)
  const setupHours = k.rows.reduce((s, r) => s + r.setup, 0)
  const days = Array.from({ length: DAYS }, (_, i) => shiftDay(start, i))
  const lineOf = (machine: unknown) => all.data!['mrp.workcenters']?.find((w) => w.id === machine)?.values.line
  const canTake = (wc: ErpRecord) => Boolean(dragged && lineOf(dragged.values.machine) === wc.values.line)
  const drop = async (e: DragEvent<HTMLDivElement>, wc: ErpRecord) => {
    e.preventDefault()
    const slot = dragged
    setDragged(null)
    if (!slot || !canTake(wc)) return
    const box = e.currentTarget.getBoundingClientRect()
    const day = Math.min(DAYS - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * DAYS)))
    const startDay = shiftDay(start, day)
    if (startDay === slot.values.start && wc.id === slot.values.machine) return
    try {
      await records.update(role, slot.type, slot.id, { ...slot.values, start: startDay, machine: wc.id })
      toast({ title: `${slot.id} dipindah ke ${String(wc.values.name)}, ${startDay}` })
    } catch (err) {
      toast({ tone: 'danger', title: 'Jadwal tidak berubah', description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="space-y-4">
      <NewButtons types={['mrp.schedule', 'mrp.planned', 'mrp.requirements']} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiTile label="Jam terjadwal, 7 hari ke depan" value={scheduled} format={(v) => `${Math.round(v)} h`} to={list('mrp.schedule')} accent note={`${k.rows.length} work centre`} />
        <KpiTile label="Beban grup" value={capacity ? (scheduled / capacity) * 100 : 0} format={(v) => `${Math.round(v)}%`} to={list('mrp.workcenters')} note={`${capacity} jam tersedia`} />
        <KpiTile label="Bottleneck" value={(k.bottleneck?.load ?? 0) * 100} format={(v) => `${Math.round(v)}%`} to={k.bottleneck ? recordPath(t('mrp.workcenters'), k.bottleneck.wc.id) : list('mrp.workcenters')} note={String(k.bottleneck?.wc.values.name ?? 'tidak ada')} />
        <KpiTile label="Changeover, 7 hari ke depan" value={setupHours} format={(v) => `${Math.round(v)} h`} to={list('mrp.changeovers')} note={`${capacity ? Math.round((setupHours / capacity) * 100) : 0}% dari kapasitas`} />
        <KpiTile label="Planned order untuk dikunci" value={(all.data['mrp.planned'] ?? []).filter((p) => p.status === 'planned').length} format={(v) => String(Math.round(v))} to={list('mrp.planned', '?status=planned')} note="dari MRP terakhir" />
      </div>

      <Card className="p-0">
        <div className="p-5 pb-3">
          <CardHeader title="Papan jadwal per work centre" icon={<CalendarRange aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">seret slot untuk memindah hari atau mesin di lini yang sama</span>} />
          <p className="-mt-2 flex flex-wrap gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-warning/70" /> Setup atau changeover sebelum slot</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-danger" /> Setup lebih pendek dari matriks changeover</span>
          </p>
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[860px] px-5">
            <div className="grid grid-cols-[180px_1fr] text-[11px] text-subtle">
              <span />
              <div className="grid" style={{ gridTemplateColumns: `repeat(${DAYS}, 1fr)` }}>
                {days.map((d) => (
                  <span key={d} className={cn('border-l border-line px-1 py-1 tabular', d === today && 'font-semibold text-accent-text')}>
                    {d.slice(8)}/{d.slice(5, 7)}
                  </span>
                ))}
              </div>
            </div>
            {k.rows.map(({ wc, jobs }) => {
              const height = Math.max(1, ...jobs.map((j) => j.lane + 1)) * 30 + 8
              return (
                <div key={wc.id} className="grid grid-cols-[180px_1fr] border-t border-line">
                  <Link to={recordPath(t('mrp.workcenters'), wc.id)} className="flex flex-col justify-center py-2 pr-3 text-sm hover:underline">
                    <span className="truncate font-medium">{String(wc.values.name)}</span>
                    <span className="truncate text-xs text-muted">{String(wc.values.line)}</span>
                  </Link>
                  <div
                    className={cn('relative transition-colors', dragged && canTake(wc) && 'bg-accent-soft/40')}
                    style={{ height }}
                    onDragOver={(e) => canTake(wc) && e.preventDefault()}
                    onDrop={(e) => void drop(e, wc)}
                  >
                    <span aria-hidden className="absolute inset-y-0 w-0.5 bg-accent/60" style={{ left: `${(BEFORE / DAYS) * 100}%` }} />
                    {jobs.map(({ job, from, to, lane, setup, matrix }) => (
                      <Link
                        key={job.id}
                        to={recordPath(t('mrp.schedule'), job.id)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          setDragged(job)
                        }}
                        onDragEnd={() => setDragged(null)}
                        title={`${job.id}, ${String(job.values.hours)} jam mulai ${String(job.values.start)}${setup ? `, setup ${setup} menit` : ''}${matrix ? ` (matriks ${matrix} menit)` : ''}`}
                        className={cn('absolute flex h-6 items-center overflow-hidden rounded-full text-[11px] font-medium whitespace-nowrap transition-opacity hover:opacity-80', BAR[job.status] ?? BAR.scheduled)}
                        style={{ top: 4 + lane * 30, left: `${(Math.max(0, from) / DAYS) * 100}%`, width: `max(28px, ${((Math.min(DAYS, to) - Math.max(0, from)) / DAYS) * 100}%)` }}
                      >
                        {setup > 0 && <span aria-hidden className={cn('h-full shrink-0', (matrix ?? 0) > setup ? 'bg-danger' : 'bg-warning/70')} style={{ width: `${(setup / 1440 / (to - from)) * 100}%` }} />}
                        <span className="truncate px-2">{refTitle('bpf.orders', String(job.values.order), all.data).split(' · ')[0]}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Kebutuhan kapasitas, 7 hari ke depan" icon={<Gauge aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">jam terjadwal terhadap jam shift</span>} />
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {[...k.rows]
            .sort((a, b) => b.load - a.load)
            .map((r) => (
              <li key={r.wc.id}>
                <Link to={list('mrp.schedule', `?q=${encodeURIComponent(String(r.wc.id))}`)} className="block hover:opacity-80">
                  <span className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{String(r.wc.values.name)}</span>
                    <span className={cn('shrink-0 text-xs tabular', r.load > 1 ? 'font-semibold text-accent-text' : 'text-muted')}>
                      {Math.round(r.week)} dari {r.available} jam, {Math.round(r.load * 100)}%
                    </span>
                  </span>
                  <Meter value={Math.min(1, r.load)} tone={r.load > 1 ? 'accent' : r.load > 0.8 ? 'fg' : 'info'} className="mt-1" label={`Beban ${String(r.wc.values.name)}`} />
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  )
}
