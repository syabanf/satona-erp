import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { SEPARATION, severanceOf } from '@/domain/payroll'
import { money } from '@/lib/format'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { useToast } from '../../ui/useToast'

const REASON_ID: Record<string, string> = { Voluntary: 'Mengundurkan diri', 'End of contract': 'Kontrak PKWT berakhir', Layoff: 'PHK karena efisiensi (rugi)', Termination: 'PHK oleh perusahaan', Retirement: 'Pensiun' }
const field = 'mt-1.5 h-11 w-full rounded-full border border-line-strong bg-raised px-4 text-base md:text-sm'

/**
 * Final settlement under PP 35/2021: severance pay, long-service pay and contract compensation by separation reason,
 * from the employee's wage and years of service. The result can be saved as an offboarding case.
 */
export default function SeverancePage() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [employeeId, setEmployeeId] = useState('')
  const [reason, setReason] = useState('Termination')
  const [lastDay, setLastDay] = useState(clock.today())
  const [busy, setBusy] = useState(false)
  if (!all.data) return <CardSkeleton lines={8} />
  const staff = (all.data['mdm.employees'] ?? []).filter((e) => e.status === 'active').toSorted((a, b) => String(a.values.name).localeCompare(String(b.values.name)))
  const employee = staff.find((e) => e.id === employeeId) ?? staff[0]
  if (!employee) return null
  const wage = (Number(employee.values.baseSalary) || 0) + (Number(employee.values.allowance) || 0)
  const years = Math.max(0, (Date.parse(lastDay) - Date.parse(String(employee.values.joined ?? lastDay))) / (365.25 * 86_400_000))
  const result = severanceOf(wage, years, reason)

  const save = async () => {
    setBusy(true)
    try {
      const saved = await records.create(role, 'hrs.offboarding', { employee: employee.id, kind: reason, lastDay, clearanceHr: 'Pending', clearanceIt: 'Pending', clearanceFinance: 'Pending', clearanceManager: 'Pending', severance: result.total })
      toast({ title: `${saved.id} dibuat`, description: `Penyelesaian akhir ${money(result.total)}.` })
    } catch (e) {
      toast({ tone: 'danger', title: 'Tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const row = (label: string, value: number, note: string) => (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-sm">
      <dt>
        {label}
        <span className="block text-xs text-muted">{note}</span>
      </dt>
      <dd className="font-medium tabular">{money(value)}</dd>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Data pemutusan" icon={<Calculator aria-hidden className="size-5 text-muted" />} />
        <div className="grid gap-4">
          <label className="text-sm font-medium">
            Karyawan
            <select value={employee.id} onChange={(e) => setEmployeeId(e.target.value)} className={field}>
              {staff.map((e) => (
                <option key={e.id} value={e.id}>{`${String(e.values.name)} · ${String(e.values.nik)}`}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Alasan
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
              {Object.keys(SEPARATION).map((r) => (
                <option key={r} value={r}>{REASON_ID[r]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Hari kerja terakhir
            <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value || clock.today())} className={field} />
          </label>
        </div>
      </Card>
      <Card>
        <CardHeader title="Penyelesaian akhir" />
        <p className="text-sm text-muted">
          Upah {money(wage)} per bulan (gaji pokok dan tunjangan tetap) · masa kerja {years.toFixed(1)} tahun sejak {String(employee.values.joined)}
        </p>
        <dl className="mt-3">
          {row('Uang pesangon', result.severance, `${SEPARATION[reason]![0]} kali ketentuan pasal 40 ayat 2`)}
          {row('Uang penghargaan masa kerja', result.service, `${SEPARATION[reason]![1]} kali ketentuan pasal 40 ayat 3`)}
          {row('Kompensasi PKWT', result.compensation, 'Satu bulan upah per 12 bulan masa kerja')}
          <div className="flex items-baseline justify-between gap-4 pt-3 text-base font-semibold">
            <dt>Jumlah</dt>
            <dd className="tabular">{money(result.total)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">Uang penggantian hak (sisa cuti, ongkos pulang) dan uang pisah mengikuti perjanjian kerja dan belum dihitung di sini.</p>
        <Button variant="accent" className="mt-4 w-full" loading={busy} onClick={save}>
          Simpan sebagai kasus offboarding
        </Button>
      </Card>
    </div>
  )
}
