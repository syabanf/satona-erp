import type { ReactNode } from 'react'
import { slipNet } from '@/domain/payroll'
import type { ErpRecord } from '@/domain/records'
import { baseIdr, ppnOf } from '@/domain/tax'
import { money } from '@/lib/format'
import type { AllRecords } from '../../records/text'

type All = AllRecords
const n = (v: unknown) => Number(v) || 0
const find = (all: All, type: string, id: unknown) => (all[type] ?? []).find((r) => r.id === id)
const SCHEME: Record<string, string> = { Subsidised: 'Bersubsidi', Commercial: 'Komersial' }
const LEVEL: Record<string, string> = { 'First reminder': 'Pengingat pertama', 'Second reminder': 'Pengingat kedua', 'Final notice': 'Peringatan terakhir' }
const day = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-')
const cell = 'border border-[#d9d8dc] px-2.5 py-1.5 align-top'
const head = 'border border-[#d9d8dc] bg-[#f1f0f1] px-2.5 py-1.5 text-left font-semibold'

function Party({ label, lines }: { label: string; lines: readonly (string | undefined)[] }) {
  return (
    <div className="border border-[#d9d8dc] px-3 py-2">
      <p className="text-[10px] text-[#666] uppercase">{label}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className={i === 0 ? 'font-semibold' : ''}>{l}</p>
      ))}
    </div>
  )
}

function Lines({ columns, rows, right = [] }: { columns: readonly string[]; rows: ReadonlyArray<readonly ReactNode[]>; right?: readonly number[] }) {
  return (
    <table className="mt-4 w-full border-collapse">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={c} className={`${head} ${right.includes(i) ? 'text-right' : ''}`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, i) => (
              <td key={i} className={`${cell} ${right.includes(i) ? 'text-right tabular-nums' : ''}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Delivery note for a sales order or one of its deliveries: who ships what to whom, by which truck, from which lots. */
function DeliveryNote({ record, all }: { record: ErpRecord; all: All }) {
  const so = record.type === 'dms.deliveries' ? find(all, 'dms.orders', record.values.order) : record
  const distributor = find(all, 'dms.distributors', so?.values.distributor)
  const qty = record.type === 'dms.deliveries' ? n(record.values.qty) : n(so?.values.qty)
  const lots = (all['gtr.movements'] ?? []).filter((m) => m.values.kind === 'Shipment' && m.values.document === record.id)
  const truck = (all['wms.weighings'] ?? []).find((w) => w.values.order === so?.id)
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Party label="Pengirim" lines={['Pabrik Pupuk', 'Gudang barang jadi Gresik']} />
        <Party label="Penerima" lines={[String(distributor?.values.name ?? '-'), String(distributor?.values.region ?? ''), distributor?.values.manager ? `u.p. ${String(distributor.values.manager)}` : undefined]} />
      </div>
      <p className="mt-3">Pesanan <span className="font-mono font-semibold">{so?.id}</span> tanggal {day(String(so?.values.date ?? ''))} · skema {SCHEME[String(so?.values.scheme)] ?? '-'} · kendaraan {String(record.values.plate || truck?.values.plate || '..................')}</p>
      <Lines
        columns={['No', 'Produk', 'Lot', 'Jumlah', 'Kemasan']}
        right={[3]}
        rows={(lots.length ? lots : [undefined]).map((m, i) => [i + 1, String(so?.values.product ?? '-'), m ? String(m.values.lotNo) : '-', `${(m ? n(m.values.qty) : qty).toLocaleString('id-ID')} t`, `${Math.round((m ? n(m.values.qty) : qty) * 20)} karung 50 kg`])}
      />
      <p className="mt-3 text-[11px] text-[#555]">Barang diterima dalam keadaan baik dan jumlah sesuai. Selisih atau kerusakan dicatat di surat jalan ini sebelum ditandatangani.</p>
    </>
  )
}

/** Purchase order: vendor, the material line with price and VAT, delivery date and the outline contract it calls off. */
function PurchaseOrder({ record, all }: { record: ErpRecord; all: All }) {
  const vendor = find(all, 'mdm.partners', record.values.vendor)
  const material = find(all, 'mdm.materials', record.values.material)
  const contract = find(all, 'vms.contracts', record.values.contract)
  const value = n(record.values.value)
  const qty = n(record.values.qty)
  const ppn = Math.round(value * 0.11)
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Party label="Kepada" lines={[String(vendor?.values.name ?? '-'), vendor?.values.city ? String(vendor.values.city) : undefined, vendor?.values.npwp ? `NPWP ${String(vendor.values.npwp)}` : undefined]} />
        <Party label="Kirim ke" lines={['Gudang bahan baku', 'Pabrik Pupuk Gresik', `Paling lambat ${day(String(record.values.delivery ?? ''))}`]} />
      </div>
      <Lines
        columns={['No', 'Barang', 'Jumlah', 'Harga satuan', 'Nilai']}
        right={[2, 3, 4]}
        rows={[[1, `${String(material?.values.name ?? record.values.material)}${material?.values.code ? ` (${String(material.values.code)})` : ''}`, `${qty.toLocaleString('id-ID')} ${String(material?.values.uom ?? '')}`, money(Math.round(value / Math.max(1, qty))), money(value)]]}
      />
      <table className="mt-2 ml-auto w-72 border-collapse">
        <tbody>
          {[['Subtotal', value], ['PPN 11%', ppn], ['Jumlah', value + ppn]].map(([label, v], i) => (
            <tr key={String(label)} className={i === 2 ? 'font-bold' : ''}>
              <td className={cell}>{label}</td>
              <td className={`${cell} text-right tabular-nums`}>{money(Number(v))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="mt-4 list-decimal space-y-0.5 pl-5 text-[11px] text-[#555]">
        {contract && <li>Pesanan ini memanggil kontrak {contract.id} {String(contract.values.title)}; harga mengikuti kontrak.</li>}
        <li>Barang wajib disertai surat jalan, COA, dan untuk bahan B3 lembar data keselamatan.</li>
        <li>Tagihan dibayar setelah barang diterima dan dicocokkan dengan PO dan penerimaan barang.</li>
      </ol>
    </>
  )
}

/** Payslip: earnings and deductions side by side, take-home pay, and the employee's tax status. */
function Payslip({ record, all }: { record: ErpRecord; all: All }) {
  const e = find(all, 'mdm.employees', record.values.employee)
  const position = find(all, 'hrs.positions', e?.values.position)
  const v = record.values
  const earn: Array<[string, unknown]> = [['Gaji pokok', v.base], ['Tunjangan tetap', v.allowance], ['Tunjangan shift', v.shiftAllowance], ['Uang makan', v.meal], ['Tunjangan bahaya', v.hazard], ['Lembur', v.overtime]]
  const cut: Array<[string, unknown]> = [['BPJS', v.bpjs], ['PPh 21', v.pph21], ['Cicilan pinjaman', v.loan], ['Tidak hadir dan cuti tanpa upah', v.absence], ['Terlambat', v.late]]
  const column = (title: string, rows: Array<[string, unknown]>) => (
    <table className="w-full border-collapse">
      <thead><tr><th colSpan={2} className={head}>{title}</th></tr></thead>
      <tbody>
        {rows.filter(([, x]) => n(x)).map(([label, x]) => (
          <tr key={label}><td className={cell}>{label}</td><td className={`${cell} text-right tabular-nums`}>{money(n(x))}</td></tr>
        ))}
        <tr className="font-bold"><td className={cell}>Jumlah</td><td className={`${cell} text-right tabular-nums`}>{money(rows.reduce((s, [, x]) => s + n(x), 0))}</td></tr>
      </tbody>
    </table>
  )
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Party label="Karyawan" lines={[String(e?.values.name ?? '-'), `NIK ${String(e?.values.nik ?? '-')}`, String(position?.values.title ?? e?.values.department ?? '')]} />
        <Party label="Periode" lines={[String(v.period), `Jenis ${v.kind === 'THR' ? 'THR' : 'gaji bulanan'}`, `Status pajak ${String(e?.values.ptkp ?? 'TK/0')}`]} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {column('Pendapatan', earn)}
        {column('Potongan', cut)}
      </div>
      <p className="mt-4 border-2 border-[#101112] px-3 py-2 text-[14px] font-bold">Gaji bersih diterima: {money(slipNet(v))}</p>
      <p className="mt-2 text-[11px] text-[#555]">Ditransfer ke rekening {String(e?.values.bankAccount ?? '-')}. Slip ini rahasia dan hanya untuk karyawan yang bersangkutan.</p>
    </>
  )
}

/** Dunning letter to the customer: the overdue invoice, how late it is, the fee, and what happens next. */
function DunningLetter({ record, all, today }: { record: ErpRecord; all: All; today: string }) {
  const invoice = find(all, 'fin.receivables', record.values.invoice)
  const customer = find(all, 'mdm.partners', invoice?.values.customer)
  const due = String(invoice?.values.due ?? '')
  const late = due ? Math.max(0, Math.round((Date.parse(String(record.values.sent || today)) - Date.parse(due)) / 86_400_000)) : 0
  const amount = invoice ? baseIdr(invoice.values) + ppnOf(invoice.values) : 0
  const level = String(record.values.level)
  const next = level === 'Final notice' ? 'Bila tidak dilunasi dalam 7 hari, pengiriman berikutnya kami hentikan dan tagihan kami serahkan ke penagihan hukum.' : 'Mohon pelunasan dalam 14 hari sejak surat ini.'
  return (
    <div className="mt-5 space-y-3 text-[13px] leading-relaxed">
      <p>Kepada Yth.<br /><span className="font-semibold">{String(customer?.values.name ?? '-')}</span><br />{String(customer?.values.city ?? '')}</p>
      <p>Perihal: <span className="font-semibold">{LEVEL[level] ?? level}</span></p>
      <p>Dengan hormat, berdasarkan catatan kami tagihan berikut belum kami terima pembayarannya:</p>
      <Lines columns={['Nomor faktur', 'Jatuh tempo', 'Terlambat', 'Nilai']} right={[2, 3]} rows={[[String(invoice?.values.invoiceNo ?? record.values.invoice), day(due), `${late} hari`, money(amount)], ...(n(record.values.fee) ? [['Denda keterlambatan', '', '', money(n(record.values.fee))]] : [])]} />
      <p>{next} Abaikan surat ini bila pembayaran sudah dilakukan, dan kirimkan bukti transfernya kepada kami.</p>
      <p>Hormat kami,</p>
    </div>
  )
}

export interface PrintDocument {
  title: string
  body: (p: { record: ErpRecord; all: All; today: string }) => ReactNode
  /** The line under the title; the record's own title when absent. */
  subtitle?: (record: ErpRecord, all: All) => string
  signatures: readonly string[]
}

/** Record types that print as their own business document instead of the generic field sheet. */
export const DOCUMENTS: Record<string, PrintDocument> = {
  'dms.orders': { title: 'Surat jalan', subtitle: (r) => `${String(r.values.product)} · ${Number(r.values.qty).toLocaleString('id-ID')} t`, body: DeliveryNote, signatures: ['Pengirim', 'Pengemudi', 'Penerima'] },
  'dms.deliveries': { title: 'Surat jalan', subtitle: (r, all) => `${String(find(all, 'dms.orders', r.values.order)?.values.product ?? '')} · ${Number(r.values.qty).toLocaleString('id-ID')} t`, body: DeliveryNote, signatures: ['Pengirim', 'Pengemudi', 'Penerima'] },
  'vms.orders': { title: 'Purchase order', body: PurchaseOrder, signatures: ['Dibuat oleh', 'Disetujui', 'Diterima pemasok'] },
  'hrs.payslips': { title: 'Slip gaji', subtitle: (r) => `Periode ${String(r.values.period)}`, body: Payslip, signatures: ['Human Capital'] },
  'fin.dunning': { title: 'Surat tagihan', subtitle: (r) => LEVEL[String(r.values.level)] ?? String(r.values.level), body: DunningLetter, signatures: ['Finance'] },
}
