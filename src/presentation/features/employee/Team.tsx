import { useState } from 'react'
import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ErpRecord } from '@/domain/records'
import { shiftOn, teamOf, weekOf, type SelfItem } from '@/domain/selfService'
import { cn } from '@/lib/cn'
import { useServices } from '../../hooks/useServices'
import type { AllRecords } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { OwnRecords } from './OwnRecords'

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const

/** The team's shift roster week by week, with approved swaps applied, and the employee's own swap requests below. */
export function Team({ item, all, me }: { item: SelfItem; all: AllRecords; me: ErpRecord }) {
  const today = useServices().clock.today()
  const [offset, setOffset] = useState(0)
  const anchor = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 7 * 86_400_000).toISOString().slice(0, 10)
  const week = weekOf(anchor)
  const shifts = (all['hrs.shifts'] ?? []).filter((s) => s.status !== 'inactive')
  const swaps = all['hrs.shiftswaps'] ?? []
  const team = teamOf(me, all['mdm.employees'] ?? []).toSorted((a, b) => Number(b.id === me.id) - Number(a.id === me.id))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Jadwal ${dayMonth(week[0]!)} sampai ${dayMonth(week[6]!)}`}
          action={
            <span className="flex items-center gap-1">
              <Button size="icon-sm" variant="soft" aria-label="Minggu sebelumnya" onClick={() => setOffset(offset - 1)}>
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <Button size="sm" variant="soft" disabled={offset === 0} onClick={() => setOffset(0)}>
                Minggu ini
              </Button>
              <Button size="icon-sm" variant="soft" aria-label="Minggu berikutnya" onClick={() => setOffset(offset + 1)}>
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Karyawan</th>
                {week.map((d, i) => (
                  <th key={d} className={cn('px-1 py-2 text-center font-medium', d === today && 'text-accent-text')}>
                    {WEEKDAYS[i]}
                    <span className="block tabular">{d.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((e) => (
                <tr key={e.id} className={cn('border-t border-line', e.id === me.id && 'bg-raised')}>
                  <th scope="row" className="max-w-40 truncate py-2 pr-3 text-left font-medium">
                    {String(e.values.name)}
                    {e.id === me.id && <span className="font-normal text-muted"> (Anda)</span>}
                  </th>
                  {week.map((d) => {
                    const shift = shiftOn(e, d, shifts, swaps)
                    const swapped = shift && shift !== shiftOn(e, d, shifts)
                    return (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <span className={cn('inline-flex min-w-16 items-center justify-center gap-1 rounded-full px-2 py-1 text-xs', !shift ? 'text-subtle' : swapped ? 'bg-info-soft text-info-text' : 'bg-control')}>
                          {swapped && <ArrowLeftRight aria-label="Tukar shift" className="size-3" />}
                          {shift ? String(shift.values.name) : 'Libur'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          {shifts.map((s) => `${String(s.values.name)} ${String(s.values.start)} sampai ${String(s.values.end)}`).join(' · ')}. Tukar shift yang disetujui atasan bertanda panah.
        </p>
      </Card>
      <h2 className="pt-2 text-lg font-semibold">Tukar shift saya</h2>
      <OwnRecords item={{ ...item, label: 'Tukar shift' }} all={all} me={me} />
    </div>
  )
}
