/** Document-to-document flows: an accepted quotation becomes an invoice, an approved requisition a PO, and so on. */
import type { ErpRecord, Values } from './records'
import { docTotal } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>

export interface Conversion {
  from: string
  to: string
  label: string
  /** Statuses of the source that allow the step; undefined allows any. */
  when?: readonly string[]
  /** The ref on the target that points back at the source, used to find what was already made. */
  link?: string
  /** Prefills the new record from the source. */
  map: (source: ErpRecord, all: All, today: string) => Values
}

const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const find = (all: All, type: string, id: unknown) => (all[type] ?? []).find((r) => r.id === id)

export const CONVERSIONS: readonly Conversion[] = [
  {
    from: 'fbl.quotations',
    to: 'fin.receivables',
    label: 'Buat invoice pelanggan',
    when: ['accepted'],
    map: (q, _all, today) => ({ invoiceNo: `INV/${q.id}`, customer: q.values.customer, entity: 'logistics', amount: q.values.total, due: plusDays(today, 30) }),
  },
  {
    from: 'vms.requisitions',
    to: 'vms.orders',
    label: 'Buat purchase order',
    when: ['approved'],
    link: 'requisition',
    map: (pr) => ({ title: pr.values.title, requisition: pr.id, vendor: pr.values.vendor, material: pr.values.material, qty: pr.values.qty, value: pr.values.value, delivery: pr.values.needBy }),
  },
  {
    from: 'vms.orders',
    to: 'vms.receipts',
    label: 'Catat penerimaan barang',
    when: ['released'],
    link: 'po',
    map: (po, _all, today) => ({ po: po.id, delivery: `SJ/${po.id}`, qty: po.values.qty, coa: 'Missing', date: today }),
  },
  {
    from: 'vms.receipts',
    to: 'fin.payables',
    label: 'Catat tagihan pemasok',
    when: ['accepted'],
    map: (gr, all, today) => {
      const po = find(all, 'vms.orders', gr.values.po)
      const pr = find(all, 'vms.requisitions', po?.values.requisition)
      return { invoiceNo: `BILL/${gr.id}`, vendor: po?.values.vendor, po: po?.id, entity: pr?.values.entity ?? 'holding', amount: po?.values.value, due: plusDays(today, 30) }
    },
  },
  {
    from: 'fin.payables',
    to: 'fin.payments',
    label: 'Bayar tagihan',
    when: ['approved'],
    link: 'invoice',
    // The amount owed in the invoice currency: base plus PPN, less the PPh 23 the company withholds.
    map: (inv, _all, today) => ({ reference: `PAY/${inv.id}`, invoice: inv.id, amount: docTotal({ ...inv.values, currency: 'IDR' }), date: today }),
  },
  {
    from: 'vms.contracts',
    to: 'vms.orders',
    label: 'Buat PO dari kontrak',
    when: ['approved'],
    link: 'contract',
    map: (c, _all, today) => ({ title: `Call-off ${String(c.values.title)}`, contract: c.id, vendor: c.values.vendor, material: c.values.material, qty: 0, value: 0, delivery: plusDays(today, 14) }),
  },
  {
    from: 'dms.orders',
    to: 'dms.deliveries',
    label: 'Kirim sebagian',
    when: ['confirmed'],
    link: 'order',
    map: (so, _all, today) => ({ order: so.id, qty: 0, date: today }),
  },
  {
    from: 'dms.deliveries',
    to: 'fin.receivables',
    label: 'Buat faktur pengiriman ini',
    when: ['shipped'],
    link: 'delivery',
    map: (dlv, all, today) => {
      const so = find(all, 'dms.orders', dlv.values.order)
      const unit = (Number(so?.values.value) || 0) / Math.max(1, Number(so?.values.qty) || 1)
      return { invoiceNo: `INV/${dlv.id}`, salesOrder: dlv.values.order, delivery: dlv.id, entity: 'fertiliser', amount: Math.round(unit * (Number(dlv.values.qty) || 0)), tax: 'PPN 11%', currency: 'IDR', due: plusDays(today, 30) }
    },
  },
  {
    from: 'dms.orders',
    to: 'dms.returns',
    label: 'Buat retur pelanggan',
    when: ['shipped', 'delivered'],
    link: 'order',
    map: (so) => ({ order: so.id, qty: 0, reason: 'Off-spec', disposition: 'Restock' }),
  },
  {
    from: 'dms.orders',
    to: 'dms.sellthrough',
    label: 'Catat penjualan konsinyasi',
    when: ['shipped', 'delivered'],
    link: 'order',
    map: (so, _all, today) => ({ order: so.id, qty: 0, date: today }),
  },
  {
    from: 'vms.receipts',
    to: 'wms.weighings',
    label: 'Buat tiket timbang',
    when: ['received', 'quarantine'],
    link: 'receipt',
    map: (grn, _all, today) => ({ direction: 'Inbound', plate: '', receipt: grn.id, gross: 0, date: today }),
  },
  {
    from: 'dms.orders',
    to: 'wms.weighings',
    label: 'Buat tiket timbang',
    when: ['confirmed'],
    link: 'order',
    map: (so, _all, today) => ({ direction: 'Outbound', plate: '', order: so.id, gross: 0, date: today }),
  },
  {
    from: 'fin.payables',
    to: 'fin.assets',
    label: 'Kapitalisasi jadi aset tetap',
    when: ['approved', 'paid'],
    link: 'invoice',
    map: (inv, _all, today) => ({ name: `Aset dari ${String(inv.values.invoiceNo)}`, entity: inv.values.entity, class: 'Plant & machinery', cost: inv.values.amount, life: 8, acquired: today, salvage: 0, method: 'Straight line', invoice: inv.id }),
  },
  {
    from: 'fin.receivables',
    to: 'fin.creditnotes',
    label: 'Buat nota kredit',
    when: ['issued', 'overdue'],
    link: 'invoice',
    map: (inv) => ({ invoice: inv.id, amount: 0, reason: '' }),
  },
  {
    from: 'fin.receivables',
    to: 'fin.dunning',
    label: 'Kirim surat tagihan',
    when: ['overdue'],
    link: 'invoice',
    map: (inv, all, today) => ({ invoice: inv.id, level: ['First reminder', 'Second reminder', 'Final notice'][Math.min(2, (all['fin.dunning'] ?? []).filter((d) => d.values.invoice === inv.id).length)], sent: today, fee: 0 }),
  },
  {
    from: 'dms.orders',
    to: 'fin.receivables',
    label: 'Buat faktur pelanggan',
    when: ['delivered'],
    link: 'salesOrder',
    map: (so, _all, today) => ({ invoiceNo: `INV/${so.id}`, salesOrder: so.id, entity: 'fertiliser', amount: so.values.value, tax: 'PPN 11%', currency: 'IDR', due: plusDays(today, 30) }),
  },
  {
    from: 'eam.requests',
    to: 'eam.workorders',
    label: 'Buat work order',
    when: ['new', 'monitor', 'converted'],
    map: (mr, _all, today) => ({ task: mr.values.title, asset: mr.values.asset, kind: 'Corrective', priority: ({ Critical: 'P1', High: 'P2', Medium: 'P3', Low: 'P4' } as Record<string, string>)[String(mr.values.severity)] ?? 'P3', due: today }),
  },
]

/** The steps available from a record, each with the records it already produced through its back-link. */
export function conversionsFor(typeKey: string, record: ErpRecord, all: All) {
  return CONVERSIONS.filter((c) => c.from === typeKey && (!c.when || c.when.includes(record.status))).map((c) => ({
    ...c,
    made: c.link ? (all[c.to] ?? []).filter((r) => r.values[c.link!] === record.id) : [],
  }))
}
