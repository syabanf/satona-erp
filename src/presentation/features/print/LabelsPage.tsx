import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { typeOf } from '@/domain/catalog'
import { useAllRecords } from '../../hooks/useRecords'
import { useSession } from '../../hooks/useSession'
import { CardSkeleton } from '../../ui/States'
import { recordPath, recordTitle } from '../../records/text'

/**
 * QR labels for the chosen records, three across an A4 sheet. Each code holds the record's link, so any phone camera
 * or the in-app scanner opens it straight away.
 */
export default function LabelsPage() {
  const { type: key = '' } = useParams()
  const [params] = useSearchParams()
  const { signedIn } = useSession()
  const all = useAllRecords()
  const [codes, setCodes] = useState<Record<string, string>>({})
  const type = typeOf(key)
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const rows = type ? (all.data?.[type.key] ?? []).filter((r) => ids.includes(r.id)) : []

  useEffect(() => {
    if (!type) return
    let live = true
    Promise.all(rows.map(async (r) => [r.id, await QRCode.toDataURL(`${window.location.origin}${recordPath(type, r.id)}`, { margin: 1, width: 240 })] as const)).then((pairs) => live && setCodes(Object.fromEntries(pairs)))
    return () => {
      live = false
    }
    // Regenerate only when the chosen records change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type?.key, rows.map((r) => r.id).join()])

  if (!signedIn) return <Navigate to="/login" replace />
  if (!all.data) return <CardSkeleton lines={6} />
  if (!type) return <p className="p-10 text-center">Jenis data tidak ditemukan.</p>

  return (
    <div className="min-h-dvh bg-canvas py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center gap-3 px-4">
        <Link to={recordPath(type)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Kembali ke {type.name.toLowerCase()}
        </Link>
        <span className="text-sm text-muted">{rows.length} label</span>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow">
          <Printer aria-hidden className="size-4" /> Cetak label
        </button>
      </div>
      <div className="mx-auto grid max-w-[210mm] grid-cols-3 gap-[4mm] bg-white p-[8mm] shadow-float print:p-0 print:shadow-none">
        {rows.map((r) => (
          <div key={r.id} className="flex break-inside-avoid flex-col items-center rounded-lg border border-[#d9d8dc] p-3 text-center text-[#101112]">
            {codes[r.id] ? <img src={codes[r.id]} alt={`QR ${r.id}`} className="size-28" /> : <span className="size-28 animate-pulse rounded bg-[#f1f0f1]" />}
            <p className="mt-1 font-mono text-[12px] font-bold">{r.id}</p>
            <p className="line-clamp-2 text-[10px] text-[#555]">{recordTitle(type, r, all.data)}</p>
            <p className="mt-0.5 text-[9px] text-[#888] uppercase">{type.singular}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
