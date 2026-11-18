import { ChevronDown } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { terCategory, terRate } from '@/domain/payroll'
import type { ErpRecord } from '@/domain/records'
import { ownRecords } from '@/domain/selfService'
import { money } from '@/lib/format'
import { StateBadge } from '../../records/StateBadge'
import type { AllRecords } from '../../records/text'
import { EmptyState } from '../../ui/States'

/** The employee's payslips from the payroll runs, newest first, each with its earnings and deductions. */
export function Payslips({ all, me }: { all: AllRecords; me: ErpRecord }) {
  const type = typeOf('hrs.payslips')!
  const slips = ownRecords(all[type.key] ?? [], me.id).toSorted((a, b) => String(b.values.period).localeCompare(String(a.values.period)))
  const ptkp = String(me.values.ptkp ?? 'TK/0')
  if (!slips.length) return <EmptyState title="Belum ada slip gaji">Slip terbit setelah HR menghitung penggajian bulan berjalan.</EmptyState>
  const line = (label: string, value: unknown, minus = false) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{minus && Number(value) ? `- ${money(Number(value))}` : money(Number(value) || 0)}</dd>
    </div>
  )
  return (
    <ul className="space-y-3">
      {slips.map((s, i) => (
        <li key={s.id}>
          <details open={i === 0} className="group rounded-card border border-line bg-card shadow-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
              <span className="min-w-0 flex-1 basis-32">
                <span className="block font-semibold">Slip gaji {String(s.values.period)}</span>
                <span className="block font-mono text-xs text-muted">{s.id}</span>
              </span>
              <StateBadge type={type} status={s.status} />
              <span className="text-lg font-semibold tabular">{money(Number(s.values.net))}</span>
              <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <dl className="divide-y divide-line border-t border-line px-4 pb-3">
              {line('Gaji pokok', s.values.base)}
              {line('Tunjangan tetap', s.values.allowance)}
              {line('Tunjangan shift', s.values.shiftAllowance)}
              {line('Uang makan', s.values.meal)}
              {line('Tunjangan bahaya', s.values.hazard)}
              {line('Lembur', s.values.overtime)}
              {line('Potongan tidak hadir dan cuti tanpa upah', s.values.absence, true)}
              {line('Potongan terlambat', s.values.late, true)}
              {line('BPJS (kesehatan 1%, JHT 2%, JP 1%)', s.values.bpjs, true)}
              {line(`PPh 21 TER ${terCategory(ptkp)} ${terRate(Number(s.values.gross), ptkp)}% (${ptkp})`, s.values.pph21, true)}
              {line('Cicilan pinjaman', s.values.loan, true)}
              <div className="flex justify-between gap-4 pt-2.5 text-sm font-semibold">
                <dt>Gaji bersih</dt>
                <dd className="tabular">{money(Number(s.values.net))}</dd>
              </div>
            </dl>
          </details>
        </li>
      ))}
    </ul>
  )
}
