/**
 * What a document step does beyond its own status: the checks that can block it, the stock it moves, the records it
 * updates or creates, and the journals it posts. One table of rules keeps purchasing, sales, production, maintenance
 * and payroll locked to stock and to the ledger. `to` is the status the document reaches; 'created' is its creation.
 */
import { duePlans } from './automation'
import { ASSET_ACCOUNT, assetBook, compose, creditedOn, POSTING, postingFor, signed, trialBalance, type Posting } from './ledger'
import { bonusSlipFor, employerBpjsOf, payslipFor, slipGross, thrSlipFor } from './payroll'
import { CONTROL_RULES } from './controls'
import { HR_RULES } from './hr'
import { energyCostOf, overheadCostOf, PLANT_RULES } from './plant'
import type { ErpRecord, Values } from './records'
import { fromTonnes } from './units'
import { baseIdr, docTotal, ppnOf } from './tax'

type All = Readonly<Record<string, readonly ErpRecord[]>>

export interface Effects {
  /** Why the step may not happen; nothing else applies when set. */
  blocker?: string
  /** Field changes on other records. */
  patches: Array<{ type: string; id: string; values: Values; action: string }>
  /** Status changes on other records. */
  moves: Array<{ type: string; id: string; status: string; action: string }>
  /** New records; `status` overrides the type's first state. */
  creates: Array<{ type: string; values: Values; status?: string }>
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
export function moveStock(all: All, material: unknown, qty: number, action: string): Effects['patches'] {
  const rows = stockOf(all, material).toSorted((a, b) => n(b.values.onHand) - n(a.values.onHand))
  if (qty < 0) return rows[0] ? [{ type: 'inv.stock', id: rows[0].id, values: { onHand: n(rows[0].values.onHand) - qty }, action }] : []
  let left = qty
  return rows.flatMap((r) => {
    const take = Math.min(left, n(r.values.onHand))
    left -= take
    return take > 0 ? [{ type: 'inv.stock', id: r.id, values: { onHand: Math.round((n(r.values.onHand) - take) * 1000) / 1000 }, action }] : []
  })
}

/** Value per unit of a material in stock: the quantity-weighted moving average of its stock rows, or the vendor price before any receipt set one. */
export function averageCost(all: All, material: unknown) {
  const rows = stockOf(all, material).filter((r) => n(r.values.avgCost) > 0 && n(r.values.onHand) > 0)
  const qty = onHand(rows)
  return qty ? Math.round(rows.reduce((s, r) => s + n(r.values.onHand) * n(r.values.avgCost), 0) / qty) : unitPrice(all, material)
}

/** Receives `qty` at `price` into the fullest stock row of a material and re-averages its cost. */
export function receiveStock(all: All, material: unknown, qty: number, price: number, action: string): Effects['patches'] {
  const [row] = stockOf(all, material).toSorted((a, b) => n(b.values.onHand) - n(a.values.onHand))
  if (!row) return []
  const had = n(row.values.onHand)
  const avgCost = Math.round((had * (n(row.values.avgCost) || price) + qty * price) / Math.max(1, had + qty))
  return [{ type: 'inv.stock', id: row.id, values: { onHand: had + qty, avgCost }, action }]
}

/** The business unit that owns a plant, through the plant's company code. */
export const entityOfPlant = (all: All, plant: unknown) => String(find(all, 'mdm.companies', find(all, 'mdm.plants', plant)?.values.company)?.values.entity ?? 'fertiliser')

/** The business unit at a site named by city or plant name, as maintenance assets record it. */
export const entityOfSite = (all: All, site: unknown) => {
  const s = String(site ?? '').toLowerCase()
  const plant = list(all, 'mdm.plants').find((p) => s && (String(p.values.city).toLowerCase() === s || String(p.values.name).toLowerCase().includes(s)))
  return plant ? entityOfPlant(all, plant.id) : 'fertiliser'
}

/** Standard cost per tonne of the formula a product is made by. */
function standardCost(all: All, product: string) {
  const token = product.startsWith('NPK') ? product : (product.split(' ')[0] ?? product)
  return n(list(all, 'bpf.formulas').find((f) => String(f.values.grade).startsWith(token))?.values.costPerT)
}

/** What a tonne of a finished product is carried at: the cost on its stock rows, else the formula standard, else `fallback`. */
export function finishedCost(all: All, product: string, fallback = 0) {
  const fg = finishedGood(all, product)
  const rows = fg ? stockOf(all, fg.id).filter((r) => n(r.values.avgCost) > 0 && n(r.values.onHand) > 0) : []
  const qty = onHand(rows)
  return qty ? rows.reduce((s, r) => s + n(r.values.onHand) * n(r.values.avgCost), 0) / qty : standardCost(all, product) || fallback
}

/** Standard conversion cost per tonne produced: direct labour, plant overhead and energy. */
export const CONVERSION = { labour: 180_000, overhead: 260_000, energy: 140_000 } as const

const K3_SUPERVISOR = ['Ahli K3 Umum', 'Ahli K3 Kimia']
/**
 * Why an employee may not be put on a job: a licence of theirs has lapsed, or they hold none of the licences the job
 * needs. Undefined when they are fit to go.
 */
export function licenceProblem(all: All, employeeId: unknown, today: string, needs: readonly string[] = []) {
  const employee = find(all, 'mdm.employees', employeeId)
  if (!employee) return undefined
  const held = list(all, 'she.licences').filter((l) => l.values.employee === employee.id)
  const lapsed = (l: ErpRecord) => l.status === 'expired' || String(l.values.expiry) < today
  const name = String(employee.values.name)
  if (needs.length && !held.some((l) => needs.includes(String(l.values.licence)) && !lapsed(l))) return `${name} tidak punya lisensi ${needs.join(' atau ')} yang masih berlaku.`
  const bad = held.find(lapsed)
  return !needs.length && bad ? `Lisensi ${String(bad.values.licence)} milik ${name} kedaluwarsa pada ${String(bad.values.expiry)}.` : undefined
}

/** The finished-goods material a product or formula grade is stocked as. */
export function finishedGood(all: All, label: string) {
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
      // The BOM gives kilograms per tonne; stock of a liquid is kept in cubic metres, so the need converts to its unit.
      const tonnes = ((n(order.values.qty) * n(b.values.kgPerT)) / 1000) * (1 + n(b.values.scrap) / 100)
      const qty = fromTonnes(tonnes, find(all, 'mdm.materials', b.values.material))
      return { material: String(b.values.material), qty, available: onHand(stockOf(all, b.values.material)), cost: Math.round(qty * averageCost(all, b.values.material)) }
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
export const payableDue = (invoice: ErpRecord) => docTotal({ ...invoice.values, currency: 'IDR' })

/** The vendor invoices a payment run names, in the order listed. */
export const runInvoices = (all: All, run: ErpRecord) => String(run.values.invoices ?? '').split(/[\s,]+/).filter(Boolean).flatMap((id) => find(all, 'fin.payables', id) ?? [])

const blocked = (reason: string | undefined) => (reason ? { blocker: reason } : undefined)

/** Tonnes of a sales order not shipped yet. */
export const unshipped = (so: ErpRecord) => Math.max(0, Math.round((n(so.values.qty) - n(so.values.shippedQty)) * 1000) / 1000)

/**
 * What shipping `qty` tonnes of a sales order does to stock and the ledger. `doc` is the document the journals point at:
 * the order itself for a full shipment, or one of its deliveries for a partial one.
 */
export function shipGoods(so: ErpRecord, qty: number, doc: ErpRecord, all: All, today: string): Partial<Effects> {
  const product = String(so.values.product)
  const fg = finishedGood(all, product)
  if (qty <= 0) return { blocker: `${so.id} sudah terkirim seluruhnya.` }
  if (fg && onHand(stockOf(all, fg.id)) < qty) return { blocker: `Stok ${String(fg.values.name)} ${onHand(stockOf(all, fg.id))} t, kurang untuk mengirim ${qty} t.` }
  const unitPrice = n(so.values.value) / Math.max(1, n(so.values.qty))
  const cost = Math.round(finishedCost(all, product, unitPrice * 0.6) * qty)
  const stockMove = fg ? moveStock(all, fg.id, qty, `Dikirim ${qty} untuk ${doc.id}`) : []
  // Consigned goods stay the plant's own until the distributor reports them sold: they move to consignment stock at cost.
  if (so.values.terms === 'Consignment') {
    const transfer = compose(all, head(doc, 'Cost of sales', `Konsinyasi ${doc.id} ${product}`, 'fertiliser', today), [[POSTING.consignment, cost, 0], [POSTING.finished, 0, cost]], doc.id)
    return { patches: stockMove, postings: transfer ? [transfer] : [] }
  }
  const posting = compose(all, head(doc, 'Cost of sales', `Harga pokok ${doc.id} ${product}`, 'fertiliser', today), [[POSTING.cogs.fertiliser!, cost, 0], [POSTING.finished, 0, cost]], doc.id)
  // Subsidised fertiliser sells at the government's retail ceiling; the state owes the gap to cost plus a 10% margin.
  const gap = so.values.scheme === 'Subsidised' ? Math.max(0, Math.round(cost * 1.1) - Math.round(unitPrice * qty)) : 0
  const subsidy = compose(all, head(doc, 'Receivable', `Piutang subsidi ${doc.id} ${product}`, 'fertiliser', today), [[POSTING.subsidyReceivable, gap, 0], [POSTING.subsidy, 0, gap]], doc.id)
  return { patches: stockMove, postings: [posting, subsidy].flatMap((p) => p ?? []) }
}

/**
 * The next tax invoice serial (NSFP): transaction code 010, the two-digit year of the invoice, and the next number in
 * the year's range after the highest one issued so far.
 */
export function nextTaxSerial(all: All, invoice: ErpRecord) {
  const year = String(invoice.values.due || invoice.createdAt || '2026').slice(2, 4)
  const used = list(all, 'fin.taxinvoices').map((t) => String(t.values.number)).filter((x) => x.startsWith(`010.${year}.`)).map((x) => Number(x.split('.').at(-1)) || 0)
  return `010.${year}.${String((used.length ? Math.max(...used) : 73_100_000) + 1).padStart(8, '0')}`
}

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
      patches: receiveStock(all, po.values.material, qty, Math.round(value / Math.max(1, qty)), `Diterima ${qty} dari ${grn.id}`),
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
    // Cancelling a shipment comes back to this status; the credit check belongs to the first confirmation only.
    if (so.status === 'shipped') return undefined
    const d = find(all, 'dms.distributors', so.values.distributor)
    const limit = n(d?.values.creditLimit)
    return d && limit && n(d.values.outstanding) + n(so.values.value) > limit ? { blocker: `Limit kredit ${String(d.values.name)} terlampaui: terpakai ${rp(n(d.values.outstanding))} dari ${rp(limit)}.` } : undefined
  },
  'dms.orders:shipped': (so, all, today) => {
    const shipment = shipGoods(so, unshipped(so), so, all, today)
    return shipment.blocker ? shipment : { ...shipment, patches: [...(shipment.patches ?? []), { type: so.type, id: so.id, values: { shippedQty: n(so.values.qty) }, action: 'Terkirim penuh' }] }
  },
  'fin.receivables:created': (invoice, all) => {
    const so = find(all, 'dms.orders', invoice.values.salesOrder)
    const patches: Effects['patches'] = []
    if (so) {
      // An order is invoiced for what has shipped: all of it once shipped or delivered, the delivered share before that.
      const share = ['shipped', 'delivered'].includes(so.status) ? 1 : n(so.values.shippedQty) / Math.max(1, n(so.values.qty))
      if (!share) return { blocker: `${so.id} belum ada yang dikirim, faktur belum bisa dibuat.` }
      const billed = list(all, 'fin.receivables').filter((r) => r.id !== invoice.id && r.values.salesOrder === so.id).reduce((s, r) => s + baseIdr(r.values), 0)
      const billable = Math.round(n(so.values.value) * share)
      if (billed + baseIdr(invoice.values) > billable) return { blocker: `Faktur melebihi nilai yang sudah dikirim lewat ${so.id}: ${rp(billable)}, sudah ditagih ${rp(billed)}.` }
      const d = find(all, 'dms.distributors', so.values.distributor)
      if (d) patches.push({ type: d.type, id: d.id, values: { outstanding: n(d.values.outstanding) + baseIdr(invoice.values) + ppnOf(invoice.values) }, action: `Piutang ${invoice.id}` })
    }
    const ppn = ppnOf(invoice.values)
    return { patches, creates: ppn ? [{ type: 'fin.taxinvoices', values: { number: nextTaxSerial(all, invoice), invoice: invoice.id, tax: 'PPN 11%', base: baseIdr(invoice.values) } }] : [] }
  },
  'fin.receivables:paid': (invoice, all) => {
    const d = find(all, 'dms.distributors', find(all, 'dms.orders', invoice.values.salesOrder)?.values.distributor)
    return d ? { patches: [{ type: d.type, id: d.id, values: { outstanding: Math.max(0, n(d.values.outstanding) - baseIdr(invoice.values) - ppnOf(invoice.values)) }, action: `Pelunasan ${invoice.id}` }] } : undefined
  },

  // Production
  'bpf.orders:released': (order, all) => {
    // Cancelling a running batch returns here with its materials back in stock; nothing to check.
    if (order.status === 'running') return undefined
    const short = bomNeeds(all, order).find((x) => x.available < x.qty)
    return short ? { blocker: `Bahan ${String(find(all, 'mdm.materials', short.material)?.values.name ?? short.material)} kurang: butuh ${short.qty}, tersedia ${short.available}.` } : undefined
  },
  'bpf.orders:running': (order, all, today) => {
    // Reopening a completed batch returns here; its materials were consumed the first time.
    if (order.status === 'completed') return undefined
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
    const qty = n(order.values.qty)
    const output = n(order.values.output) || qty
    const material = n(order.values.materialCost)
    const energy = energyCostOf(all, order, today)
    const [labour, overhead] = [Math.round(qty * CONVERSION.labour), overheadCostOf(all, order, today) + energy]
    const actual = material + labour + overhead
    const formula = find(all, 'bpf.formulas', order.values.formula)
    // Finished goods enter stock at the formula's standard cost; what the batch cost beyond that is a variance.
    const standard = n(formula?.values.costPerT) || Math.round(actual / Math.max(1, qty))
    const finished = Math.round(output * standard)
    const yieldVariance = Math.round((qty - output) * standard)
    const usageVariance = actual - finished - yieldVariance
    const title = `${order.id} ${String(order.values.title)}`
    const conversion = compose(all, head(order, 'Production', `Tenaga kerja, overhead dan energi ${title}`, 'fertiliser', today), [[POSTING.wip, labour + overhead, 0], [POSTING.wages, 0, labour], [POSTING.accrual, 0, overhead]], order.id)
    const receipt = compose(all, head(order, 'Production', `Hasil produksi ${title}`, 'fertiliser', today), [[POSTING.finished, finished, 0], signed(POSTING.yieldVariance, yieldVariance), signed(POSTING.usageVariance, usageVariance), [POSTING.wip, 0, actual]], order.id)
    const fg = finishedGood(all, String(formula?.values.grade ?? ''))
    return {
      patches: [...(fg ? receiveStock(all, fg.id, output, standard, `Hasil ${order.id}`) : []), { type: order.type, id: order.id, values: { output, conversionCost: labour + overhead, energyCost: energy, yieldVariance, usageVariance }, action: `Biaya produksi ${rp(actual)}, selisih ${rp(yieldVariance + usageVariance)}` }],
      postings: [conversion, receipt].flatMap((p) => p ?? []),
    }
  },

  // Stock and co-products
  'inv.adjustments:approved': (adj, all, today) => {
    const stock = find(all, 'inv.stock', adj.values.stock)
    if (!stock) return undefined
    const qty = n(adj.values.qty)
    if (n(stock.values.onHand) + qty < 0) return { blocker: `Penyesuaian ${qty} melebihi stok ${n(stock.values.onHand)}.` }
    const value = Math.sign(qty) * n(adj.values.value)
    const posting = compose(all, head(adj, 'Manual', `Penyesuaian stok ${adj.id}: ${String(adj.values.reason)}`, entityOfPlant(all, stock.values.plant), today), [signed(POSTING.inventory, value), signed(POSTING.countVariance, -value)], adj.id)
    return { patches: [{ type: stock.type, id: stock.id, values: { onHand: n(stock.values.onHand) + qty }, action: `Disesuaikan ${qty} lewat ${adj.id}` }], postings: posting ? [posting] : [] }
  },
  'inv.counts:posted': (count, all, today) => {
    const value = n(count.values.value)
    const posting = compose(all, head(count, 'Manual', `Selisih stok opname ${count.id} ${String(count.values.scope)}`, entityOfPlant(all, count.values.plant), today), [signed(POSTING.inventory, value), signed(POSTING.countVariance, -value)], count.id)
    return { postings: posting ? [posting] : [] }
  },
  'cfp.coproducts:posted': (c, all, today) => {
    const posting = compose(all, head(c, 'Production', `Alokasi biaya gabungan ${c.id} ${String(c.values.product)}`, 'chemicals', today), [[POSTING.finished, n(c.values.allocated), 0], [POSTING.wip, 0, n(c.values.allocated)]], c.id)
    return { postings: posting ? [posting] : [] }
  },
  'dms.subsidyclaims:created': (claim, all) => {
    const open = trialBalance(all, { entity: 'fertiliser' }).rows.find((r) => r.account.values.code === POSTING.subsidyReceivable)?.balance ?? 0
    const claimed = list(all, 'dms.subsidyclaims').filter((c) => c.id !== claim.id && !['paid', 'rejected'].includes(c.status)).reduce((s, c) => s + n(c.values.amount), 0)
    return n(claim.values.amount) > open - claimed ? { blocker: `Klaim melebihi piutang subsidi yang belum diklaim: ${rp(Math.max(0, open - claimed))}.` } : undefined
  },
  'dms.subsidyclaims:paid': (claim, all, today) => {
    const posting = compose(all, head(claim, 'Receipt', `Pembayaran subsidi ${String(claim.values.period)}`, 'fertiliser', today), [[POSTING.bank, n(claim.values.amount), 0], [POSTING.subsidyReceivable, 0, n(claim.values.amount)]], claim.id)
    return { postings: posting ? [posting] : [] }
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
  'eam.workorders:assigned': (wo, all, today) => blocked(licenceProblem(all, find(all, 'eam.technicians', wo.values.technician)?.values.employee, today)),
  'eam.workorders:progress': (wo, all, today) => blocked(licenceProblem(all, find(all, 'eam.technicians', wo.values.technician)?.values.employee, today)),
  'she.permits:approved': (permit, all, today) => blocked(licenceProblem(all, permit.values.supervisor, today, K3_SUPERVISOR)),
  'she.permits:active': (permit, all, today) => blocked(licenceProblem(all, permit.values.supervisor, today, K3_SUPERVISOR)),
  'eam.issues:issued': (issue, all) => {
    const wo = find(all, 'eam.workorders', issue.values.workorder)
    return wo ? { patches: [{ type: wo.type, id: wo.id, values: { partsCost: n(wo.values.partsCost) + n(issue.values.cost) }, action: `Suku cadang ${issue.id} ${rp(n(issue.values.cost))}` }] } : undefined
  },
  'eam.workorders:completed': (wo, all, today) => {
    const parts = n(wo.values.partsCost)
    const labour = n(wo.values.cost) - parts
    const asset = find(all, 'eam.assets', wo.values.asset)
    const posting = compose(all, head(wo, 'Maintenance', `Biaya ${wo.id} ${String(wo.values.task)}`, entityOfSite(all, asset?.values.site), today), [[POSTING.maintenance, parts + labour, 0], [POSTING.spares, 0, parts], [POSTING.accrual, 0, labour]], wo.id)
    return {
      patches: asset ? [{ type: asset.type, id: asset.id, values: { maintenanceCost: n(asset.values.maintenanceCost) + parts + labour }, action: `Biaya ${wo.id} ${rp(parts + labour)}` }] : [],
      postings: posting ? [posting] : [],
    }
  },

  // Payroll
  'hrs.payroll:calculated': (run, all, today) => {
    const period = String(run.values.period)
    const kind = String(run.values.kind || 'Regular')
    const ofRun = (p: ErpRecord) => p.values.period === period && String(p.values.kind || 'Regular') === kind
    const have = new Set(list(all, 'hrs.payslips').filter(ofRun).map((p) => p.values.employee))
    const staff = list(all, 'mdm.employees').filter((e) => e.status === 'active' && e.values.entity === run.values.entity)
    const slips = staff.filter((e) => !have.has(e.id)).map((e) => (kind === 'THR' ? thrSlipFor(e, period, today) : kind === 'Bonus' ? bonusSlipFor(e, period, n(run.values.bonusPct)) : payslipFor(e, period, all)))
    const every = [...slips, ...list(all, 'hrs.payslips').filter((p) => ofRun(p) && p.values.entity === run.values.entity).map((p) => p.values)]
    const gross = every.reduce((s, v) => s + slipGross(v), 0)
    const deductions = every.reduce((s, v) => s + n(v.bpjs) + n(v.pph21) + n(v.loan), 0)
    return { creates: slips.map((values) => ({ type: 'hrs.payslips', values })), patches: every.length ? [{ type: run.type, id: run.id, values: { headcount: every.length, gross, deductions }, action: `${every.length} slip gaji dihitung` }] : [] }
  },
  'hrs.payroll:paid': (run, all, today) => {
    const slips = list(all, 'hrs.payslips').filter((p) => p.values.period === run.values.period && String(p.values.kind || 'Regular') === String(run.values.kind || 'Regular') && p.values.entity === run.values.entity && p.status !== 'paid')
    // The employer's own BPJS share is a cost on top of gross pay; a THR run carries none.
    const employer = slips.reduce((s, p) => s + (['THR', 'Bonus'].includes(String(p.values.kind)) ? 0 : employerBpjsOf(n(p.values.base))), 0)
    const sum = (f: (v: Values) => number) => slips.reduce((s, p) => s + f(p.values), 0)
    const [gross, bpjs, tax, loan] = [sum(slipGross), sum((v) => n(v.bpjs)), sum((v) => n(v.pph21)), sum((v) => n(v.loan))]
    // Severance in a final payslip is paid with the run and its final tax is owed with PPh 21.
    const [severance, finalTax] = [sum((v) => n(v.severance)), sum((v) => n(v.severanceTax))]
    const posting = compose(all, head(run, 'Payroll', `Gaji ${String(run.values.period)}`, run.values.entity, today), [[POSTING.payroll, gross + employer + severance, 0], [POSTING.bank, 0, gross - bpjs - tax - loan + severance - finalTax], [POSTING.accrual, 0, bpjs + employer], [POSTING.pph21, 0, tax + finalTax], [POSTING.advance, 0, loan]], run.id)
    return { moves: slips.map((p) => ({ type: p.type, id: p.id, status: 'paid', action: `Dibayar lewat ${run.id}` })), postings: posting ? [posting] : [] }
  },

  // Ledger and treasury
  'fin.journals:reversed': (journal, all, today) => ({
    postings: [{
      journal: { description: `Pembalikan ${journal.id} ${String(journal.values.description)}`, entity: journal.values.entity, date: today, source: 'Manual', reference: `REV/${journal.id}`, amount: journal.values.amount },
      lines: list(all, 'fin.journallines').filter((l) => l.values.journal === journal.id).map((l) => ({ account: l.values.account, costcenter: l.values.costcenter, debit: n(l.values.credit), credit: n(l.values.debit), memo: `Pembalikan ${journal.id}` })),
    }],
  }),
  'fin.assets:disposed': (asset, all, today) => {
    const { accumulated, book } = assetBook(asset.values, today)
    const proceeds = n(asset.values.proceeds)
    // Proceeds above book value are a gain (other income); below it, a loss (other expense).
    const posting = compose(all, head(asset, 'Manual', `Pelepasan aset ${asset.id} ${String(asset.values.name)}`, asset.values.entity, today), [
      [POSTING.bank, proceeds, 0],
      [POSTING.accumulated, accumulated, 0],
      [POSTING.expense, Math.max(0, book - proceeds), 0],
      [ASSET_ACCOUNT[String(asset.values.class)] ?? '1510', 0, n(asset.values.cost)],
      [POSTING.sales.holding!, 0, Math.max(0, proceeds - book)],
    ], asset.id)
    return { postings: posting ? [posting] : [] }
  },
  'fin.paymentruns:created': (run, all) => {
    const invoices = runInvoices(all, run)
    if (!invoices.length) return { blocker: 'Payment run belum berisi tagihan.' }
    const bad = invoices.find((i) => i.status !== 'approved')
    return bad ? { blocker: `${bad.id} belum disetujui untuk dibayar atau sudah lunas.` } : undefined
  },
  'fin.paymentruns:executed': (run, all, today) => {
    const invoices = runInvoices(all, run).filter((i) => i.status === 'approved')
    const bank = String(find(all, 'mdm.accounts', find(all, 'mdm.banks', run.values.bank)?.values.glAccount)?.values.code ?? POSTING.bank)
    // One journal per unit that owns invoices in the run, so each unit's payable account falls by what was paid for it.
    const units = [...new Set(invoices.map((i) => String(i.values.entity)))]
    const postings = units.flatMap((unit) => {
      const mine = invoices.filter((i) => i.values.entity === unit)
      const total = mine.reduce((s, i) => s + payableDue(i) - paidOn(all, i.id), 0)
      return compose(all, head(run, 'Payment', `Payment run ${run.id}: ${mine.length} tagihan`, unit, today), [[POSTING.payable, total, 0], [bank, 0, total]], run.id) ?? []
    })
    return { moves: invoices.map((i) => ({ type: i.type, id: i.id, status: 'paid', action: `Lunas lewat ${run.id}` })), postings }
  },
  'fin.allocations:posted': (a, _all, today) => {
    if (a.values.fromCenter === a.values.toCenter) return { blocker: 'Pusat biaya asal dan tujuan harus berbeda.' }
    const amount = n(a.values.amount)
    const memo = `Alokasi ${a.id}`
    return { postings: [{ journal: { ...head(a, 'Manual', String(a.values.description), a.values.entity, today), date: String(a.values.date || today), amount }, lines: [{ account: a.values.account, costcenter: a.values.toCenter, debit: amount, credit: 0, memo }, { account: a.values.account, costcenter: a.values.fromCenter, debit: 0, credit: amount, memo }] }] }
  },
  'fin.cashmoves:posted': (move, all, today) => {
    const glOf = (bankId: unknown) => String(find(all, 'mdm.accounts', find(all, 'mdm.banks', bankId)?.values.glAccount)?.values.code ?? '')
    const counter = find(all, 'mdm.accounts', move.values.account)
    const [bank, amount, kind] = [glOf(move.values.bank), n(move.values.amount), String(move.values.kind)]
    if (kind === 'Transfer' ? !move.values.toBank || move.values.toBank === move.values.bank : !counter) return { blocker: kind === 'Transfer' ? 'Transfer butuh rekening tujuan yang berbeda.' : 'Pilih akun lawan untuk kas masuk atau kas keluar.' }
    if (counter && counter.values.postable !== 'Yes') return { blocker: `${String(counter.values.name)} adalah akun induk, pilih akun rincian.` }
    const other = kind === 'Transfer' ? glOf(move.values.toBank) : String(counter!.values.code)
    const lines: Array<readonly [string, number, number]> = kind === 'Cash in' ? [[bank, amount, 0], [other, 0, amount]] : [[other, amount, 0], [bank, 0, amount]]
    const posting = compose(all, { ...head(move, 'Cash', String(move.values.description), move.values.entity, today), date: String(move.values.date || today) }, lines, move.id)
    return posting ? { postings: [posting] } : { blocker: 'Rekening bank belum punya akun buku besar.' }
  },
  'fin.creditnotes:created': (note, all) => {
    const invoice = find(all, 'fin.receivables', note.values.invoice)
    if (!invoice || !['issued', 'overdue'].includes(invoice.status)) return { blocker: 'Nota kredit hanya untuk faktur yang masih terbuka.' }
    const left = baseIdr(invoice.values) + ppnOf(invoice.values) - creditedOn(all, invoice.id)
    return n(note.values.amount) > left ? { blocker: `Nota kredit melebihi sisa faktur ${invoice.id}: ${rp(left)}.` } : undefined
  },
  'fin.creditnotes:approved': (note, all, today) => {
    const invoice = find(all, 'fin.receivables', note.values.invoice)
    if (!invoice) return undefined
    const base = n(note.values.amount)
    const ppn = invoice.values.tax === 'PPN 11%' ? Math.round(base * 0.11) : 0
    const posting = compose(all, head(note, 'Receivable', `Nota kredit ${note.id} untuk ${String(invoice.values.invoiceNo)}`, invoice.values.entity, today), [[POSTING.sales[String(invoice.values.entity)] ?? POSTING.sales.holding!, base, 0], [POSTING.vatOut, ppn, 0], [POSTING.receivable, 0, base + ppn]], note.id)
    return { postings: posting ? [posting] : [] }
  },

  // People
  'hrs.loans:created': (loan, all) => {
    const employee = find(all, 'mdm.employees', loan.values.employee)
    if (list(all, 'hrs.loans').some((l) => l.id !== loan.id && l.values.employee === loan.values.employee && ['draft', 'submitted', 'approved'].includes(l.status))) return { blocker: 'Karyawan ini masih punya pinjaman berjalan. Satu pinjaman aktif per karyawan.' }
    const limit = n(employee?.values.baseSalary) * 0.3
    return limit && n(loan.values.installment) > limit ? { blocker: `Cicilan ${rp(n(loan.values.installment))} melebihi 30% gaji pokok (${rp(limit)}). Perpanjang tenor atau kurangi nilai.` } : undefined
  },
  'hrs.jobs:created': (job, all) => (find(all, 'hrs.requisitions', job.values.requisition)?.status === 'approved' ? undefined : { blocker: 'Lowongan hanya dibuka dari permintaan tenaga kerja yang sudah disetujui.' }),
  'hrs.psikotes:reviewed': (test, all) => {
    const candidate = find(all, 'hrs.candidates', test.values.candidate)
    return candidate ? { patches: [{ type: candidate.type, id: candidate.id, values: { psychotest: n(test.values.score) }, action: `Hasil ${String(test.values.instrument)} ${n(test.values.score)}` }] } : undefined
  },
  'hrs.offers:accepted': (offer, all) => {
    const candidate = find(all, 'hrs.candidates', offer.values.candidate)
    return candidate && candidate.status === 'offer' ? { moves: [{ type: candidate.type, id: candidate.id, status: 'hired', action: `Menerima ${offer.id}` }] } : undefined
  },
  'hrs.resignations:approved': (r) => ({ creates: [{ type: 'hrs.offboarding', values: { employee: r.values.employee, kind: 'Voluntary', lastDay: r.values.lastDay, clearanceHr: 'Pending', clearanceIt: 'Pending', clearanceFinance: 'Pending', clearanceManager: 'Pending', exitNotes: String(r.values.reason ?? '') } }] }),
  'hrs.offboarding:completed': (o, all) => {
    const open = (['clearanceHr', 'clearanceIt', 'clearanceFinance', 'clearanceManager'] as const).filter((k) => o.values[k] !== 'Cleared')
    if (open.length) return { blocker: `Clearance belum lengkap: ${open.map((k) => k.replace('clearance', '')).join(', ')}.` }
    const employee = find(all, 'mdm.employees', o.values.employee)
    return employee && employee.status === 'active' ? { moves: [{ type: employee.type, id: employee.id, status: 'inactive', action: `Offboarding ${o.id} selesai` }] } : undefined
  },
  'hrs.profilechanges:approved': (c) => {
    const key = ({ Name: 'name', Department: 'department', 'Tax status (PTKP)': 'ptkp' } as Record<string, string>)[String(c.values.field)]
    return key ? { patches: [{ type: 'mdm.employees', id: String(c.values.employee), values: { [key]: c.values.proposed }, action: `${String(c.values.field)} diubah lewat ${c.id}` }] } : undefined
  },
  'hrs.merit:approved': (m) => ({ patches: [{ type: 'mdm.employees', id: String(m.values.employee), values: { baseSalary: n(m.values.proposed), allowance: Math.round(n(m.values.proposed) * 0.15) }, action: `Gaji pokok naik ke ${rp(n(m.values.proposed))} lewat ${m.id}` }] }),
  'hrs.corrections:approved': (c, all) => {
    const row = list(all, 'hrs.attendance').find((a) => a.values.employee === c.values.employee && a.values.date === c.values.date)
    const times = { checkIn: c.values.checkIn, checkOut: c.values.checkOut }
    if (row) return { patches: [{ type: row.type, id: row.id, values: { ...times, result: 'On time' }, action: `Dikoreksi lewat ${c.id}` }] }
    return { creates: [{ type: 'hrs.attendance', values: { employee: c.values.employee, date: c.values.date, shift: list(all, 'hrs.shifts')[0]?.id ?? '', ...times, result: 'On time', method: 'Mobile GPS', location: `Koreksi ${c.id}` } }] }
  },
  'hrs.expenses:approved': (e, all, today) => {
    const posting = compose(all, head(e, 'Payable', `Klaim biaya ${e.id} ${String(e.values.description)}`, find(all, 'mdm.employees', e.values.employee)?.values.entity, today), [[POSTING.general, n(e.values.amount), 0], [POSTING.accrual, 0, n(e.values.amount)]], e.id)
    return { postings: posting ? [{ ...posting, lines: posting.lines.map((l, i) => (i === 0 ? { ...l, costcenter: e.values.costcenter } : l)) }] : [] }
  },
  'hrs.expenses:paid': (e, all, today) => {
    const posting = compose(all, head(e, 'Payment', `Penggantian klaim ${e.id}`, find(all, 'mdm.employees', e.values.employee)?.values.entity, today), [[POSTING.accrual, n(e.values.amount), 0], [POSTING.bank, 0, n(e.values.amount)]], e.id)
    return { postings: posting ? [posting] : [] }
  },
}

/** Everything a document step sets off, including the journal the ledger rules raise for it. */
export function effectsFor(typeKey: string, record: ErpRecord, to: string, all: All, today: string): Effects {
  const step = `${typeKey}:${to}`
  const rules = [RULES[step], PLANT_RULES[step], CONTROL_RULES[step], HR_RULES[step]].flatMap((rule) => rule?.(record, all, today) ?? [])
  const blocker = rules.find((r) => r.blocker)?.blocker
  if (blocker) return { blocker, patches: [], moves: [], creates: [], postings: [] }
  const posting = postingFor(typeKey, record, to, all, today)
  return { patches: rules.flatMap((r) => r.patches ?? []), moves: rules.flatMap((r) => r.moves ?? []), creates: rules.flatMap((r) => r.creates ?? []), postings: [...rules.flatMap((r) => r.postings ?? []), ...(posting ? [posting] : [])] }
}
