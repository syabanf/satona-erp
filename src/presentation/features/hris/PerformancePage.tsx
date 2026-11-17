import { useState } from 'react'
import { Link } from 'react-router'
import { Users } from 'lucide-react'
import { BANDS, calibration, feedbackAssignments, feedbackSummary, MIN_REVIEWERS } from '@/domain/performance'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { refTitle } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/useToast'

const VIEWS = [{ value: 'calibration', label: 'Kalibrasi' }, { value: 'feedback', label: 'Siklus 360' }] as const
const BAND_COLOR = ['bg-success', 'bg-info', 'bg-warning', 'bg-danger']
const select = 'h-9 cursor-pointer rounded-full border border-line-strong bg-card px-3 text-sm'

/**
 * Performance cycles. Calibration shows how the ratings of a review period spread per department, so a session can
 * question a department that rates everyone at the top. The 360 tab opens a round for an org unit and reads its results.
 */
export default function PerformancePage() {
  const all = useAllRecords()
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [view, setView] = useState<(typeof VIEWS)[number]['value']>('calibration')
  const [period, setPeriod] = useState('')
  const [unit, setUnit] = useState('')
  const [busy, setBusy] = useState(false)
  if (!all.data) return <CardSkeleton lines={8} />
  const data = all.data
  const periods = [...new Set((data['hrs.reviews'] ?? []).map((r) => String(r.values.period)))].sort().reverse()
  const cal = calibration(data, period || periods[0] || '')
  const units = (data['hrs.orgunits'] ?? []).filter((o) => (data['mdm.employees'] ?? []).some((e) => e.values.orgunit === o.id))
  const orgunit = unit || units[0]?.id || ''
  const assignments = feedbackAssignments(data, orgunit)
  const summary = feedbackSummary(data)

  const open = async () => {
    setBusy(true)
    try {
      toast({ title: `${await records.createMany(role, 'hrs.feedback360', assignments)} penilaian 360 dibuka`, description: 'Penilai mengisinya dari Area karyawan.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Siklus tidak dibuka', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const tile = (label: string, value: string | number) => (
    <div className="rounded-card border border-line bg-card p-4 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular">{value}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <Tabs label="Siklus kinerja" options={VIEWS} value={view} onChange={setView} />
      {view === 'calibration' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tile('Penilaian periode ini', cal.total.count)}
            {tile('Sudah final', cal.total.final)}
            {tile('Rata-rata skor akhir', cal.total.average)}
            {tile('Predikat Istimewa', `${cal.total.count ? Math.round((cal.total.bands[0]! / cal.total.count) * 100) : 0}%`)}
          </div>
          <Card>
            <CardHeader
              title="Sebaran predikat per departemen"
              action={
                <select value={period || periods[0]} onChange={(e) => setPeriod(e.target.value)} aria-label="Periode" className={select}>
                  {periods.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              }
            />
            <ul className="divide-y divide-line">
              {cal.rows.map((r) => (
                <li key={r.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <Link to={`/modules/hrs/reviews?q=${encodeURIComponent(r.name)}`} className="w-40 text-sm font-medium hover:text-accent-text">
                    {r.name}
                    <span className="block text-xs font-normal text-muted">{r.count} orang · rata-rata {r.average}</span>
                  </Link>
                  <div role="img" aria-label={BANDS.map((b, i) => `${b} ${r.bands[i]}`).join(', ')} className="flex h-6 min-w-40 flex-1 overflow-hidden rounded-full bg-control">
                    {r.bands.map((n, i) => n > 0 && <span key={BANDS[i]} className={cn('grid place-items-center text-[11px] font-semibold text-white', BAND_COLOR[i])} style={{ width: `${(n / r.count) * 100}%` }}>{n}</span>)}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {BANDS.map((b, i) => (
                <span key={b} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-2.5 rounded-full', BAND_COLOR[i])} /> {b} {cal.total.bands[i]}
                </span>
              ))}
            </p>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Buka siklus 360"
              icon={<Users aria-hidden className="size-5 text-muted" />}
              action={
                <span className="flex flex-wrap items-center gap-2">
                  <select value={orgunit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit organisasi" className={select}>
                    {units.map((o) => (
                      <option key={o.id} value={o.id}>{String(o.values.name)}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="accent" disabled={!assignments.length} loading={busy} onClick={open}>
                    Buka {assignments.length} penilaian
                  </Button>
                </span>
              }
            />
            <p className="text-sm text-muted">
              Penilai ditetapkan otomatis: diri sendiri, atasan unit, bawahan menilai atasan, dan paling banyak tiga rekan. Pasangan yang masih punya penilaian terbuka dilewati.
            </p>
            <p className="mt-2 text-sm">
              {(['Self', 'Manager', 'Direct report', 'Peer'] as const).map((rel) => `${{ Self: 'Diri sendiri', Manager: 'Atasan', 'Direct report': 'Bawahan', Peer: 'Rekan' }[rel]} ${assignments.filter((a) => a.relation === rel).length}`).join(' · ')}
            </p>
          </Card>
          <Card>
            <CardHeader title="Hasil 360 per karyawan" />
            <ul className="divide-y divide-line">
              {summary.slice(0, 20).map((s) => (
                <li key={s.subject} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48 truncate font-medium">{refTitle('mdm.employees', s.subject, data).split(' · ')[0]}</span>
                  <span className="text-xs text-muted">{s.done} masuk · {s.pending} menunggu</span>
                  <span className="w-28 text-right font-semibold tabular">{s.visible ? `${s.average} dari 5` : <span className="text-xs font-normal text-muted">Kurang dari {MIN_REVIEWERS} penilai</span>}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
