/** Document-to-document flows: an accepted quotation becomes an invoice, an approved requisition a PO, and so on. */
import type { ErpRecord, Values } from './records'

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
    map: (inv, _all, today) => ({ reference: `PAY/${inv.id}`, invoice: inv.id, amount: inv.values.amount, date: today }),
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
