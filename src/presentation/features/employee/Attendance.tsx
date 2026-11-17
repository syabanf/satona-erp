import { useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, LogIn, LogOut, MapPin } from 'lucide-react'
import type { ErpRecord } from '@/domain/records'
import { clockResult, geofenceOf, ownRecords, shiftOn, weekOf } from '@/domain/selfService'
import { cn } from '@/lib/cn'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { useStored } from '../../hooks/useStored'
import type { AllRecords } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { useToast } from '../../ui/useToast'
import { shiftLabel, WEEKDAYS } from './Team'

const RESULT = {
  'On time': { label: 'Tepat waktu', cell: 'bg-success-soft text-success' },
  Late: { label: 'Terlambat', cell: 'bg-warning-soft text-warning' },
  Absent: { label: 'Tidak hadir', cell: 'bg-danger-soft text-danger' },
  'On leave': { label: 'Cuti', cell: 'bg-info-soft text-info-text' },
} as const
type Result = keyof typeof RESULT

/** The device position, or nothing when the device has none or the employee refuses. Resolves within eight seconds either way. */
const locate = () =>
  new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
    if (!navigator.geolocation) return resolve(undefined)
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(undefined), { enableHighAccuracy: true, timeout: 8000 })
  })

/** A photo file as a 240 px JPEG data URL, small enough to keep on the device. */
const thumbnail = (file: File) =>
  new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = 240 / Math.max(img.width, img.height)
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) })
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.src = URL.createObjectURL(file)
  })

/**
 * The employee clocks in and out with their position and an optional selfie, and sees the month as a calendar.
 * The selfie stays on this device; the attendance row carries the time, the result against the shift and the position.
 */
export function Attendance({ all, me }: { all: AllRecords; me: ErpRecord }) {
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const today = clock.today()
  const [busy, setBusy] = useState(false)
  const [selfie, setSelfie] = useState('')
  const [selfies, setSelfies] = useStored<Record<string, string>>('wit-selfies', {})
  const [month, setMonth] = useState(today.slice(0, 7))
  const [picked, setPicked] = useState(today)

  const mine = ownRecords(all['hrs.attendance'] ?? [], me.id)
  const byDate = new Map(mine.map((a) => [String(a.values.date), a]))
  const now = byDate.get(today)
  const shifts = (all['hrs.shifts'] ?? []).filter((s) => s.status !== 'inactive')
  const shift = shiftOn(me, today, shifts, all['hrs.shiftswaps'] ?? [], all['mdm.employees'] ?? [])

  async function punch() {
    setBusy(true)
    try {
      const [position, time] = [await locate(), new Date().toTimeString().slice(0, 5)]
      // The clock-in is kept either way; outside the radius it is flagged for HR to review.
      const fence = geofenceOf(position, (all['hrs.worklocations'] ?? []).filter((l) => l.status !== 'inactive'))
      const location = position ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} · ${fence.state === 'Inside' ? 'di dalam' : `${fence.distance} m dari`} ${fence.name}` : 'Tanpa lokasi (izin ditolak atau tidak tersedia)'
      if (now) {
        await records.updateOwn(role, 'hrs.attendance', now.id, { checkOut: time, location: `${String(now.values.location ?? '')} | pulang: ${location}` })
        toast({ title: `Clock out ${time}`, description: location })
      } else {
        const work = shift ?? shifts[0]!
        const result = clockResult(time, String(work.values.start))
        const saved = await records.create(role, 'hrs.attendance', { date: today, shift: work.id, checkIn: time, result, method: 'Mobile GPS', location, geofence: fence.state }, true)
        if (selfie) setSelfies({ ...selfies, [saved.id]: selfie })
        setSelfie('')
        toast({ title: `Clock in ${time}, ${RESULT[result].label.toLowerCase()}`, description: location })
      }
    } catch (e) {
      toast({ tone: 'danger', title: 'Absensi tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  // Calendar weeks of the month, Monday first, padded with the neighbouring months' days.
  const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const weeks = [...new Set(Array.from({ length: lastDay }, (_, i) => weekOf(`${month}-${String(i + 1).padStart(2, '0')}`).join())).values()].map((w) => w.split(','))
  const shiftMonth = (by: number) => setMonth(new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7))
  const inMonth = mine.filter((a) => String(a.values.date).startsWith(month))
  const detail = byDate.get(picked)
  const done = Boolean(now?.values.checkOut)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card className="space-y-4">
        <CardHeader title="Hari ini" />
        <div>
          <p className="text-[34px] leading-none font-medium tabular">{now ? String(now.values.checkIn ?? '--:--') : '--:--'}</p>
          <p className="mt-1 text-sm text-muted">
            {now ? `Masuk${now.values.checkOut ? `, pulang ${String(now.values.checkOut)}` : ', belum clock out'}` : 'Belum clock in'} · Shift {shift ? `${shiftLabel(shift)} ${String(shift.values.start)} sampai ${String(shift.values.end)}` : 'libur'}
          </p>
        </div>
        {!now && (
          <label className="flex cursor-pointer items-center gap-3 rounded-panel border border-dashed border-line-strong p-3 text-sm hover:bg-raised">
            {selfie ? <img src={selfie} alt="Selfie absensi" className="size-12 rounded-xl object-cover" /> : <span className="grid size-12 place-items-center rounded-xl bg-control text-muted"><Camera aria-hidden className="size-5" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{selfie ? 'Ganti foto' : 'Tambah selfie (opsional)'}</span>
              <span className="block text-xs text-muted">Foto disimpan di perangkat ini</span>
            </span>
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={async (e) => e.target.files?.[0] && setSelfie(await thumbnail(e.target.files[0]))} />
          </label>
        )}
        <Button variant={now ? 'solid' : 'accent'} className="w-full" disabled={done} loading={busy} onClick={punch}>
          {now ? <LogOut aria-hidden className="size-4" /> : <LogIn aria-hidden className="size-4" />}
          {done ? 'Absensi hari ini selesai' : now ? 'Clock out' : 'Clock in'}
        </Button>
        {now?.values.location && (
          <p className="flex items-start gap-2 text-xs text-muted">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {String(now.values.location)}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title={new Date(Date.UTC(y, m - 1, 1)).toLocaleString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          action={
            <span className="flex gap-1">
              <Button size="icon-sm" variant="soft" aria-label="Bulan sebelumnya" onClick={() => shiftMonth(-1)}>
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <Button size="icon-sm" variant="soft" aria-label="Bulan berikutnya" onClick={() => shiftMonth(1)}>
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </span>
          }
        />
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1 text-muted">{d}</span>
          ))}
          {weeks.flat().map((d) => {
            const a = byDate.get(d)
            const result = a ? RESULT[String(a.values.result) as Result] : undefined
            return (
              <button
                key={d}
                type="button"
                aria-pressed={picked === d}
                aria-label={`${d}${result ? `, ${result.label}` : ''}`}
                onClick={() => setPicked(d)}
                className={cn('grid h-10 cursor-pointer place-items-center rounded-xl sm:h-12 text-sm tabular transition-colors', result?.cell ?? 'hover:bg-raised', !d.startsWith(month) && 'opacity-30', d === today && 'font-bold', picked === d && 'outline-2 outline-offset-1 outline-accent')}
              >
                {Number(d.slice(8))}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(RESULT) as Result[]).map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', RESULT[r].cell)} /> {RESULT[r].label} {inMonth.filter((a) => a.values.result === r).length}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-panel bg-raised p-3 text-sm">
          {detail && selfies[detail.id] && <img src={selfies[detail.id]} alt="Selfie absensi" className="size-12 rounded-xl object-cover" />}
          <p className="min-w-0 flex-1">
            <span className="block font-semibold">{picked}</span>
            <span className="block text-muted">
              {detail ? `${RESULT[String(detail.values.result) as Result]?.label ?? String(detail.values.result)} · masuk ${String(detail.values.checkIn ?? '-')} · pulang ${String(detail.values.checkOut ?? '-')} · ${String(detail.values.method)}` : 'Tidak ada catatan absensi.'}
            </span>
            {detail?.values.location && <span className="block truncate text-xs text-muted">{String(detail.values.location)}</span>}
          </p>
        </div>
      </Card>
    </div>
  )
}
