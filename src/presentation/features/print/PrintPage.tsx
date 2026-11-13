import { Link, Navigate, useParams } from 'react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { RECORD_TYPES, typeOf } from '@/domain/catalog'
import { childTypes, stateOf } from '@/domain/records'
import { APP_NAME } from '@/lib/brand'
import { money } from '@/lib/format'
import { useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { CardSkeleton } from '../../ui/States'
import { ENTITY_NAME, fieldText, recordPath, recordTitle } from '../../records/text'

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Any record as an official document, ready for the printer or "Save as PDF": letterhead, title and number, every field,
 * its line items with totals, and signature boxes for the approval chain. The toolbar hides itself when printing.
 */
export default function PrintPage() {
  const { type: key = '', id = '' } = useParams()
  const { signedIn, role } = useSession()
  const all = useAllRecords()
  const { erp } = useServices()
  const modules = useResource('erp.modules', () => erp.modules())
  const type = typeOf(key)
  if (!signedIn) return <Navigate to="/login" replace />
  if (!all.data) return <CardSkeleton lines={8} />
  const record = type && all.data[type.key]?.find((r) => r.id === id)
  if (!type || !record) return <p className="p-10 text-center">Dokumen {id} tidak ditemukan.</p>

  const data = all.data
  // The record's own unit, else the unit that runs its module.
  const unit = ENTITY_NAME[String(record.values.entity ?? modules.data?.find((m) => m.id === type.module)?.entity ?? '')] ?? APP_NAME
  const docDate = type.insight.dateField && record.values[type.insight.dateField] ? String(record.values[type.insight.dateField]) : record.createdAt
  const fields = type.fields.filter((f) => f.type !== 'textarea' && record.values[f.key] !== '' && record.values[f.key] !== undefined)
  const notes = type.fields.filter((f) => f.type === 'textarea' && record.values[f.key])
  const lines = childTypes(type.key, RECORD_TYPES).flatMap(({ type: ct, field }) => {
    const rows = (data[ct.key] ?? []).filter((r) => r.values[field.key] === record.id)
    return rows.length ? [{ type: ct, field, rows }] : []
  })
  const signed = record.approvals ?? []
  const boxes = signed.length ? signed.map((s) => ({ title: `Disetujui · level ${s.level}`, name: s.by, role: s.role, at: s.at })) : [{ title: 'Dibuat oleh', name: record.history[0]?.by ?? '', role: '', at: record.createdAt }, { title: 'Diperiksa', name: '', role: '', at: '' }, { title: 'Disetujui', name: '', role: '', at: '' }]

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center gap-3 px-4">
        <Link to={recordPath(type, record.id)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke {record.id}
        </Link>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow">
          <Printer aria-hidden className="size-4" /> Cetak / Simpan PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[12px] text-[#101112] shadow-float print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#101112] pb-4">
          <img src="/wit-logo-ink.png" alt="WIT" className="h-9 w-auto" />
          <div className="text-right">
            <p className="text-base font-bold uppercase">{unit}</p>
            <p className="text-[11px] text-[#555]">{APP_NAME}</p>
          </div>
        </header>

        <div className="mt-5 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-wide uppercase">{type.singular}</h1>
            <p className="mt-0.5 text-[13px] font-semibold">{recordTitle(type, record, data)}</p>
          </div>
          <dl className="text-right text-[11px]">
            <div>
              <dt className="inline text-[#555]">Nomor: </dt>
              <dd className="inline font-mono font-semibold">{record.id}</dd>
            </div>
            <div>
              <dt className="inline text-[#555]">Tanggal: </dt>
              <dd className="inline">{day(docDate)}</dd>
            </div>
            <div>
              <dt className="inline text-[#555]">Status: </dt>
              <dd className="inline font-semibold">{stateOf(type, record.status)?.label ?? record.status}</dd>
            </div>
          </dl>
        </div>

        <table className="mt-5 w-full border-collapse">
          <tbody>
            {Array.from({ length: Math.ceil(fields.length / 2) }, (_, i) => fields.slice(i * 2, i * 2 + 2)).map((pair) => (
              <tr key={pair[0]!.key}>
                {pair.map((f) => (
                  <td key={f.key} className="w-1/2 border border-[#d9d8dc] px-2.5 py-1.5 align-top">
                    <span className="block text-[10px] text-[#666] uppercase">{f.label}</span>
                    <span className="font-medium">{fieldText(f, record.values[f.key], data)}</span>
                  </td>
                ))}
                {pair.length === 1 && <td className="border border-[#d9d8dc]" />}
              </tr>
            ))}
          </tbody>
        </table>

        {lines.map(({ type: ct, field, rows }) => {
          const cols = ct.fields.filter((f) => f.key !== field.key && f.list).slice(0, 6)
          const sum = ct.insight.sumField
          const total = sum ? rows.reduce((s, r) => s + (Number(r.values[sum]) || 0), 0) : 0
          return (
            <section key={ct.key} className="mt-5 break-inside-avoid">
              <h2 className="mb-1.5 text-[13px] font-bold">{ct.name}</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#f1f0f1]">
                    <th className="border border-[#d9d8dc] px-2 py-1 text-left">No</th>
                    {cols.map((f) => (
                      <th key={f.key} className="border border-[#d9d8dc] px-2 py-1 text-left">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="border border-[#d9d8dc] px-2 py-1">{i + 1}</td>
                      {cols.map((f) => (
                        <td key={f.key} className={`border border-[#d9d8dc] px-2 py-1 ${f.type === 'money' || f.unit === 'Rp' ? 'text-right tabular-nums' : ''}`}>
                          {fieldText(f, r.values[f.key], data)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sum && (
                    <tr className="font-bold">
                      <td colSpan={cols.length} className="border border-[#d9d8dc] px-2 py-1 text-right">
                        Jumlah
                      </td>
                      <td className="border border-[#d9d8dc] px-2 py-1 text-right tabular-nums">{money(total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )
        })}

        {notes.map((f) => (
          <section key={f.key} className="mt-5">
            <h2 className="text-[11px] font-bold uppercase">{f.label}</h2>
            <p className="mt-1 whitespace-pre-wrap">{String(record.values[f.key])}</p>
          </section>
        ))}

        <section className="mt-10 grid grid-cols-3 gap-6 break-inside-avoid">
          {boxes.map((b, i) => (
            <div key={i} className="text-center">
              <p className="text-[11px] text-[#555]">{b.title}</p>
              <div className="mt-14 border-t border-[#101112] pt-1">
                <p className="font-semibold">{b.name || ' '}</p>
                <p className="text-[10px] text-[#555]">{b.role || (b.at ? day(b.at) : 'Nama dan tanggal')}</p>
              </div>
            </div>
          ))}
        </section>

        <footer className="mt-10 border-t border-[#d9d8dc] pt-2 text-[10px] text-[#777]">
          Dicetak oleh {role.name} pada {new Date().toLocaleString('id-ID')} dari {APP_NAME}. Dokumen ini sah tanpa tanda tangan basah bila disetujui di sistem.
        </footer>
      </article>
    </div>
  )
}
