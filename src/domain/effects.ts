/**
 * What a document step does beyond its own status: the checks that can block it, the stock it moves, the records it
 * updates or creates, and the journals it posts. One table of rules keeps purchasing, sales, production, maintenance
 * and payroll locked to stock and to the ledger. `to` is the status the document reaches; 'created' is its creation.
 */
import { duePlans } from './automation'
import { compose, POSTING, postingFor, type Posting } from './ledger'
import { payslipFor, slipGross } from './payroll'
import type { ErpRecord, Values } from './records'
import { baseIdr, docTotal, ppnOf } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>

export interface Effects {
  /** Why the step may not happen; nothing else applies when set. */
  blocker?: string
  /** Field changes on other records. */
  patches: Array<{ type: string; id: string; values: Values; action: string }>
  /** Status changes on other records. */
  moves: Array<{ type: string; id: string; status: string; action: string }>
  creates: Array<{ type: string; values: Values }>
  postings: Posting[]
}

const n = (v: unknown) => Number(v) || 0
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
const list = (all: All, type: string) => all[type] ?? []
const find = (all: All, type: string, id: unknown) => list(all, type).find((r) => r.id === id)
const head = (record: ErpRecord, source: string, description: string, entity: unknown, today: string): Values => ({ description, entity: String(entity || 'holding'), date: today, source, reference: record.id })
/** Tolerance of the three-way match and of over-delivery against the order. */
const TOLERANCE = 1.02

const stockOf = (all: All, material: unknown) => list(all, 'inv.stock').filter((s) => s.values.material === material && s.status !== 'inactive')
const onHand = (rows: readonly ErpRecord[]) => rows.reduce((s, r) => s + n(r.values.onHand), 0)

/** Takes `qty` from the stock rows of a material, fullest first; adds to the first row when `qty` is negative. */
function moveStock(all: All, material: unknown, qty: number, action: string): Effects['patches'] {
  const rows = stockOf(all, material).toSorted((a, b) => n(b.values.onHand) - n(a.values.onHand))
  if (qty < 0) return rows[0] ? [{ type: 'inv.stock', id: rows[0].id, values: { onHand: n(rows[0].values.onHand) - qty }, action }] : []
  let left = qty
  return rows.flatMap((r) => {
    const take = Math.min(left, n(r.values.onHand))
    left -= take
    return take > 0 ? [{ type: 'inv.stock', id: r.id, values: { onHand: Math.round((n(r.values.onHand) - take) * 1000) / 1000 }, action }] : []
  })
}

/** The finished-goods material a product or formula grade is stocked as. */
function finishedGood(all: All, label: string) {
  const token = label.startsWith('NPK') ? label : (label.split(' ')[0] ?? label)
  return list(all, 'mdm.materials').find((m) => String(m.values.code).startsWith('FG-') && String(m.values.name).includes(token))
}

/** Purchase price of a material per unit: the average of its vendor info records. */
function unitPrice(all: All, material: unknown) {
  const prices = list(all, 'vms.inforecords').filter((r) => r.values.material === material && r.status !== 'inactive').map((r) => n(r.values.price))
  return prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 5_000_000
}

/** Materials a production order needs from its formula's bill of materials, with scrap. */
export function bomNeeds(all: All, order: ErpRecord) {
  return list(all, 'bpf.bom')
    .filter((b) => b.values.formula === order.values.formula && b.status !== 'inactive')
    .map((b) => {
      const qty = Math.round(((n(order.values.qty) * n(b.values.kgPerT)) / 1000) * (1 + n(b.values.scrap) / 100) * 1000) / 1000
      return { material: String(b.values.material), qty, available: onHand(stockOf(all, b.values.material)), cost: Math.round(qty * unitPrice(all, b.values.material)) }
    })
}

const ACCEPTED_GRN = 'accepted'
const receivedQty = (all: All, po: unknown, statuses: readonly string[]) => list(all, 'vms.receipts').filter((g) => g.values.po === po && statuses.includes(g.status)).reduce((s, g) => s + n(g.values.qty), 0)

/** The three-way match of a vendor invoice against its purchase order and the goods accepted so far. */
export function threeWayMatch(all: All, invoice: ErpRecord) {
  const po = find(all, 'vms.orders', invoice.values.po)
  if (!po) return { ok: false, reason: 'Tagihan belum dihubungkan ke purchase order.' }
  if (po.values.vendor !== invoice.values.vendor) return { ok: false, reason: `Pemasok tagihan berbeda dengan pemasok ${po.id}.` }
  const accepted = receivedQty(all, po.id, [ACCEPTED_GRN])
  if (!accepted) return { ok: false, reason: `Belum ada penerimaan barang yang diterima untuk ${po.id}.` }
  const received = Math.round(n(po.values.value) * Math.min(1, accepted / Math.max(1, n(po.values.qty))))
  const billed = list(all, 'fin.payables').filter((p) => p.id !== invoice.id && p.values.po === po.id && ['matched', 'approved', 'paid'].includes(p.status)).reduce((s, p) => s + baseIdr(p.values), 0)
  const base = baseIdr(invoice.values)
  const ok = base + billed <= received * TOLERANCE
  return { ok, po, accepted, received, billed, base, reason: ok ? undefined : `Tagihan ${rp(base)} ditambah yang sudah ditagih ${rp(billed)} melebihi nilai barang diterima ${rp(received)} (${accepted} dari ${n(po.values.qty)}).` }
}

const paidOn = (all: All, invoice: unknown, except?: string) => list(all, 'fin.payments').filter((p) => p.values.invoice === invoice && p.status === 'approved' && p.id !== except).reduce((s, p) => s + n(p.values.amount), 0)
/** What a vendor invoice still owes, in its own currency. */
const payableDue = (invoice: ErpRecord) => docTotal({ ...invoice.values, currency: 'IDR' })

type Rule = (record: ErpRecord, all: All, today: string) => Partial<Effects> | undefined

const RULES: Record<string, Rule> = {
  // Procure to pay
  'vms.orders:created': (po, all) => {
    const pr = find(all, 'vms.requisitions', po.values.requisition)
    if (!pr) return undefined
    if (!['approved', 'po'].includes(pr.status)) return { blocker: `${pr.id} belum disetujui, PO belum bisa dibuat.` }
    return { moves: pr.status === 'approved' ? [{ type: pr.type, id: pr.id, status: 'po', action: `Menjadi ${po.id}` }] : [] }
  },
  'vms.receipts:created': (grn, all) => {
    const po = find(all, 'vms.orders', grn.values.po)
    if (!po || po.status !== 'released') return { blocker: 'Barang hanya diterima untuk purchase order yang sudah dirilis.' }
    const so_far = receivedQty(all, po.id, ['received', 'quarantine', ACCEPTED_GRN])
    if (so_far + n(grn.values.qty) > n(po.values.qty) * TOLERANCE) return { blocker: `Penerimaan ${n(grn.values.qty)} melebihi sisa ${po.id}: dipesan ${n(po.values.qty)}, sudah diterima ${so_far}.` }
    return undefined
  },
  'vms.receipts:accepted': (grn, all, today) => {
    const po = find(all, 'vms.orders', grn.values.po)
    if (!po) return undefined
    const qty = n(grn.values.qty)
    const value = Math.round((n(po.values.value) / Math.max(1, n(po.values.qty))) * qty)
    const spare = find(all, 'mdm.materials', po.values.material)?.values.code === 'MRO-SPARE'
    const posting = compose(all, head(grn, 'Goods receipt', `Penerimaan barang ${grn.id} untuk ${po.id}`, find(all, 'vms.requisitions', po.values.requisition)?.values.entity, today), [[spare ? POSTING.spares : POSTING.inventory, value, 0], [POSTING.grir, 0, value]], grn.id)
    const complete = receivedQty(all, po.id, [ACCEPTED_GRN]) + qty >= n(po.values.qty)
    return {
      patches: moveStock(all, po.values.material, -qty, `Diterima ${qty} dari ${grn.id}`),
      moves: complete && po.status === 'released' ? [{ type: po.type, id: po.id, status: 'closed', action: 'Diterima penuh' }] : [],
      postings: posting ? [posting] : [],
    }
  },
  'fin.payables:matched': (invoice, all) => {
    const match = threeWayMatch(all, invoice)
    return match.ok ? undefined : { blocker: match.reason }
  },
  'fin.payments:created': (payment, all) => {
    const invoice = find(all, 'fin.payables', payment.values.invoice)
    if (!invoice || invoice.status !== 'approved') return { blocker: 'Pembayaran hanya untuk tagihan yang sudah disetujui dan belum lunas.' }
    const due = payableDue(invoice) - paidOn(all, invoice.id, payment.id)
    return n(payment.values.amount) > due ? { blocker: `Pembayaran melebihi sisa tagihan ${invoice.id}: ${rp(due)}.` } : undefined
  },
  'fin.payments:approved': (payment, all) => {
    const invoice = find(all, 'fin.payables', payment.values.invoice)
    if (!invoice) return undefined
    const settled = paidOn(all, invoice.id, payment.id) + n(payment.values.amount) >= payableDue(invoice)
    return { moves: settled && invoice.status === 'approved' ? [{ type: invoice.type, id: invoice.id, status: 'paid', action: `Lunas lewat ${payment.id}` }] : [] }
  },

  // Order to cash
  'dms.orders:confirmed': (so, all) => {
    const d = find(all, 'dms.distributors', so.values.distributor)
    const limit = n(d?.values.creditLimit)
    return d && limit && n(d.values.outstanding) + n(so.values.value) > limit ? { blocker: `Limit kredit ${String(d.values.name)} terlampaui: terpakai ${rp(n(d.values.outstanding))} dari ${rp(limit)}.` } : undefined
  },
  'dms.orders:shipped': (so, all, today) => {
    const product = String(so.values.product)
    const fg = finishedGood(all, product)
    const qty = n(so.values.qty)
    if (fg && onHand(stockOf(all, fg.id)) < qty) return { blocker: `Stok ${String(fg.values.name)} ${onHand(stockOf(all, fg.id))} t, kurang untuk mengirim ${qty} t.` }
    const formula = list(all, 'bpf.formulas').find((f) => String(f.values.grade).startsWith(product.startsWith('NPK') ? product : (product.split(' ')[0] ?? product)))
    const cost = formula ? Math.round(n(formula.values.costPerT) * qty) : Math.round(n(so.values.value) * 0.6)
    const posting = compose(all, head(so, 'Cost of sales', `Harga pokok ${so.id} ${product}`, 'fertiliser', today), [[POSTING.cogs.fertiliser!, cost, 0], [POSTING.finished, 0, cost]], so.id)
    return { patches: fg ? moveStock(all, fg.id, qty, `Dikirim ${qty} untuk ${so.id}`) : [], postings: posting ? [posting] : [] }
  },
  'fin.receivables:created': (invoice, all) => {
    const so = find(all, 'dms.orders', invoice.values.salesOrder)
    const patches: Effects['patches'] = []
    if (so) {
      if (so.status !== 'delivered') return { blocker: `${so.id} belum terkirim sampai tujuan, faktur belum bisa dibuat.` }
      if (list(all, 'fin.receivables').some((r) => r.id !== invoice.id && r.values.salesOrder === so.id)) return { blocker: `${so.id} sudah punya faktur.` }
      const d = find(all, 'dms.distributors', so.values.distributor)
      if (d) patches.push({ type: d.type, id: d.id, values: { outstanding: n(d.values.outstanding) + baseIdr(invoice.values) + ppnOf(invoice.values) }, action: `Piutang ${invoice.id}` })
    }
    const ppn = ppnOf(invoice.values)
    return { patches, creates: ppn ? [{ type: 'fin.taxinvoices', values: { number: `010.26.${invoice.id.replace(/\D/g, '').padStart(8, '0')}`, invoice: invoice.id, tax: 'PPN 11%', base: baseIdr(invoice.values) } }] : [] }
  },
  'fin.receivables:paid': (invoice, all) => {
    const d = find(all, 'dms.distributors', find(all, 'dms.orders', invoice.values.salesOrder)?.values.distributor)
    return d ? { patches: [{ type: d.type, id: d.id, values: { outstanding: Math.max(0, n(d.values.outstanding) - baseIdr(invoice.values) - ppnOf(invoice.values)) }, action: `Pelunasan ${invoice.id}` }] } : undefined
  },

  // Production
  'bpf.orders:released': (order, all) => {
    const short = bomNeeds(all, order).find((x) => x.available < x.qty)
    return short ? { blocker: `Bahan ${String(find(all, 'mdm.materials', short.material)?.values.name ?? short.material)} kurang: butuh ${short.qty}, tersedia ${short.available}.` } : undefined
  },
  'bpf.orders:running': (order, all, today) => {
    const needs = bomNeeds(all, order)
    const short = needs.find((x) => x.available < x.qty)
    if (short) return { blocker: `Bahan ${String(find(all, 'mdm.materials', short.material)?.values.name ?? short.material)} kurang: butuh ${short.qty}, tersedia ${short.available}.` }
    const cost = needs.reduce((s, x) => s + x.cost, 0)
    const posting = compose(all, head(order, 'Production', `Pemakaian bahan ${order.id} ${String(order.values.title)}`, 'fertiliser', today), [[POSTING.wip, cost, 0], [POSTING.inventory, 0, cost]], order.id)
    return {
      patches: [...needs.flatMap((x) => moveStock(all, x.material, x.qty, `Dipakai ${x.qty} untuk ${order.id}`)), { type: order.type, id: order.id, values: { materialCost: cost }, action: `Biaya bahan ${rp(cost)}` }],
      postings: posting ? [posting] : [],
    }
  },
  'bpf.orders:completed': (order, all, today) => {
    const cost = n(order.values.materialCost)
    const fg = finishedGood(all, String(find(all, 'bpf.formulas', order.values.formula)?.values.grade ?? ''))
    const posting = compose(all, head(order, 'Production', `Hasil produksi ${order.id} ${String(order.values.title)}`, 'fertiliser', today), [[POSTING.finished, cost, 0], [POSTING.wip, 0, cost]], order.id)
    return { patches: fg ? moveStock(all, fg.id, -n(order.values.qty), `Hasil ${order.id}`) : [], postings: posting ? [posting] : [] }
  },

  // Maintenance
  'eam.meters:created': (meter, all, today) => {
    const asset = find(all, 'eam.assets', meter.values.asset)
    if (!asset || n(meter.values.reading) <= n(asset.values.runHours)) return undefined
    const hours = n(meter.values.reading)
    const after = { ...all, 'eam.assets': list(all, 'eam.assets').map((a) => (a.id === asset.id ? { ...a, values: { ...a.values, runHours: hours } } : a)) }
    const due = duePlans(after, today).filter((d) => d.plan.values.asset === asset.id)
    return {
      patches: [{ type: asset.type, id: asset.id, values: { runHours: hours }, action: `Jam jalan ${hours} dari ${meter.id}` }, ...due.map((d) => ({ type: d.plan.type, id: d.plan.id, values: d.update, action: 'Work order PM dibuat otomatis' }))],
      creates: due.map((d) => ({ type: 'eam.workorders', values: d.order })),
    }
  },
  'eam.issues:issued': (issue, all) => {
    const wo = find(all, 'eam.workorders', issue.values.workorder)
    return wo ? { patches: [{ type: wo.type, id: wo.id, values: { partsCost: n(wo.values.partsCost) + n(issue.values.cost) }, action: `Suku cadang ${issue.id} ${rp(n(issue.values.cost))}` }] } : undefined
  },
  'eam.workorders:completed': (wo, all, today) => {
    const parts = n(wo.values.partsCost)
    const labour = n(wo.values.cost) - parts
    const asset = find(all, 'eam.assets', wo.values.asset)
    const posting = compose(all, head(wo, 'Maintenance', `Biaya ${wo.id} ${String(wo.values.task)}`, 'fertiliser', today), [[POSTING.maintenance, parts + labour, 0], [POSTING.spares, 0, parts], [POSTING.accrual, 0, labour]], wo.id)
    return {
      patches: asset ? [{ type: asset.type, id: asset.id, values: { maintenanceCost: n(asset.values.maintenanceCost) + parts + labour }, action: `Biaya ${wo.id} ${rp(parts + labour)}` }] : [],
      postings: posting ? [posting] : [],
    }
  },

  // Payroll
  'hrs.payroll:calculated': (run, all) => {
    const period = String(run.values.period)
    const have = new Set(list(all, 'hrs.payslips').filter((p) => p.values.period === period).map((p) => p.values.employee))
    const staff = list(all, 'mdm.employees').filter((e) => e.status === 'active' && e.values.entity === run.values.entity)
    const slips = staff.filter((e) => !have.has(e.id)).map((e) => payslipFor(e, period, list(all, 'hrs.overtime'), list(all, 'hrs.loans')))
    const every = [...slips, ...list(all, 'hrs.payslips').filter((p) => p.values.period === period && p.values.entity === run.values.entity).map((p) => p.values)]
    const gross = every.reduce((s, v) => s + slipGross(v), 0)
    const deductions = every.reduce((s, v) => s + n(v.bpjs) + n(v.pph21) + n(v.loan), 0)
    return { creates: slips.map((values) => ({ type: 'hrs.payslips', values })), patches: every.length ? [{ type: run.type, id: run.id, values: { headcount: every.length, gross, deductions }, action: `${every.length} slip gaji dihitung` }] : [] }
  },
  'hrs.payroll:paid': (run, all, today) => {
    const slips = list(all, 'hrs.payslips').filter((p) => p.values.period === run.values.period && p.values.entity === run.values.entity && p.status !== 'paid')
    const sum = (f: (v: Values) => number) => slips.reduce((s, p) => s + f(p.values), 0)
    const [gross, bpjs, tax, loan] = [sum(slipGross), sum((v) => n(v.bpjs)), sum((v) => n(v.pph21)), sum((v) => n(v.loan))]
    const posting = compose(all, head(run, 'Payroll', `Gaji ${String(run.values.period)}`, run.values.entity, today), [[POSTING.payroll, gross, 0], [POSTING.bank, 0, gross - bpjs - tax - loan], [POSTING.accrual, 0, bpjs], [POSTING.pph21, 0, tax], [POSTING.advance, 0, loan]], run.id)
    return { moves: slips.map((p) => ({ type: p.type, id: p.id, status: 'paid', action: `Dibayar lewat ${run.id}` })), postings: posting ? [posting] : [] }
  },
}

/** Everything a document step sets off, including the journal the ledger rules raise for it. */
export function effectsFor(typeKey: string, record: ErpRecord, to: string, all: All, today: string): Effects {
  const rule = RULES[`${typeKey}:${to}`]?.(record, all, today)
  if (rule?.blocker) return { blocker: rule.blocker, patches: [], moves: [], creates: [], postings: [] }
  const posting = postingFor(typeKey, record, to, all, today)
  return { patches: rule?.patches ?? [], moves: rule?.moves ?? [], creates: rule?.creates ?? [], postings: [...(rule?.postings ?? []), ...(posting ? [posting] : [])] }
}
