/**
 * Plant-floor controls layered on the document rules in `effects.ts`: lot tracking from receipt to shipment, quality
 * holds and the COA gate, weighbridge tickets, metered energy, turnaround packages and the budget check on requisitions.
 * A rule here adds to the base rule of the same step; a blocker from either stops the step.
 */
import { averageCost, bomNeeds, CONVERSION, finishedCost, finishedGood, moveStock, receiveStock, type Effects } from './effects'
import { compose, costCentreSpend, POSTING, signed, type Posting } from './ledger'
import type { ErpRecord, Values } from './records'
import { weekOf } from './selfService'

type All = Readonly<Record<string, readonly ErpRecord[]>>
type Rule = (record: ErpRecord, all: All, today: string) => Partial<Effects> | undefined

const n = (v: unknown) => Number(v) || 0
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
const list = (all: All, type: string) => all[type] ?? []
const find = (all: All, type: string, id: unknown) => list(all, type).find((r) => r.id === id)
const plusDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const movement = (kind: string, lotNo: string, material: unknown, qty: number, document: string, date: string) => ({ type: 'gtr.movements', values: { lotNo, kind, material, qty, document, date } as Values })
/** Net weight may differ from the document quantity by this share before the gate refuses it. */
const WEIGH_TOLERANCE = 0.005

/** Raw-material lots of a material that still hold stock, first to expire first. */
const rawLots = (all: All, material: unknown) => list(all, 'wms.lots').filter((l) => l.values.material === material && ['received', 'stored'].includes(l.status) && n(l.values.qty) > 0).toSorted((a, b) => String(a.values.expiry).localeCompare(String(b.values.expiry)))

/** Takes `qty` from lots in order; returns what each lot gives. */
function allocate(lots: readonly ErpRecord[], qty: number, field: string) {
  let left = qty
  return lots.flatMap((lot) => {
    const take = Math.min(left, n(lot.values[field]))
    left = Math.round((left - take) * 1000) / 1000
    return take > 0 ? [{ lot, take }] : []
  })
}

/** A finished lot may ship when it is released and, if it came from a production order, a COA was issued for that order. */
export function lotCleared(all: All, lot: ErpRecord) {
  if (lot.status !== 'released') return false
  if (!lot.values.order) return true
  const samples = new Set(list(all, 'qc.samples').filter((s) => s.values.order === lot.values.order).map((s) => s.id))
  return list(all, 'qc.coa').some((c) => c.status === 'issued' && samples.has(String(c.values.sample)))
}

/** Lot-tracked finished stock of a material: what may ship now and what quality still holds back. */
export function finishedLots(all: All, material: string) {
  const lots = list(all, 'gtr.lots').filter((l) => l.values.material === material && n(l.values.remaining) > 0 && l.status !== 'recalled').toSorted((a, b) => String(a.values.produced).localeCompare(String(b.values.produced)))
  const cleared = lots.filter((l) => lotCleared(all, l))
  const sum = (ls: readonly ErpRecord[]) => ls.reduce((s, l) => s + n(l.values.remaining), 0)
  return { cleared, held: sum(lots) - sum(cleared) }
}

/**
 * Energy cost of a production order from the line's meter readings of the month: the month's utility cost spread over
 * the tonnes the line runs or completed that month. Without readings the standard rate per tonne applies.
 */
export function energyCostOf(all: All, order: ErpRecord, today: string) {
  const month = today.slice(0, 7)
  const metered = list(all, 'mes.utilities').filter((u) => u.values.line === order.values.line && String(u.values.date).startsWith(month)).reduce((s, u) => s + n(u.values.cost), 0)
  const tonnes = list(all, 'bpf.orders').filter((o) => o.values.line === order.values.line && (o.id === order.id || (['running', 'completed'].includes(o.status) && String(o.values.planned).startsWith(month)))).reduce((s, o) => s + n(o.values.qty), 0)
  return Math.round(n(order.values.qty) * (metered && tonnes ? metered / tonnes : CONVERSION.energy))
}

const PRODUCTION_CENTRE = /production|maintenance|qc|produksi|perawatan/i

/**
 * Plant overhead of a production order from what the production departments spent this month: the posted expense of
 * the production, maintenance and QC cost centres spread over the month's tonnes. Without such postings the standard
 * rate per tonne applies.
 */
export function overheadCostOf(all: All, order: ErpRecord, today: string) {
  const month = today.slice(0, 7)
  const centres = new Set(list(all, 'mdm.costcenters').filter((c) => PRODUCTION_CENTRE.test(String(c.values.name))).map((c) => c.id))
  const spent = costCentreSpend(all, { from: `${month}-01`, to: `${month}-31` }).filter((r) => centres.has(r.centre)).reduce((s, r) => s + r.amount, 0)
  const tonnes = list(all, 'bpf.orders').filter((o) => o.id === order.id || (['running', 'completed'].includes(o.status) && String(o.values.planned).startsWith(month))).reduce((s, o) => s + n(o.values.qty), 0)
  return Math.round(n(order.values.qty) * (spent > 0 && tonnes ? spent / tonnes : CONVERSION.overhead))
}

/** Share of the nameplate rate a line sustains over a week, after changeovers, cleaning and minor stops. */
const LINE_EFFICIENCY = 0.85
const LOADING = ['planned', 'released', 'running']

/**
 * Weekly load of each production line against what it can make: the slowest work centre of the line sets the rate,
 * times its shifts, seven days and the line efficiency. Lines without work centres have no known capacity.
 */
export function capacityLoad(all: All, today: string, weeks = 4) {
  const lines = [...new Set(list(all, 'mrp.workcenters').filter((w) => w.status !== 'inactive').map((w) => String(w.values.line)))]
  return lines.flatMap((line) => {
    const centres = list(all, 'mrp.workcenters').filter((w) => w.values.line === line && w.status !== 'inactive')
    const bottleneck = centres.toSorted((a, b) => n(a.values.capacity) - n(b.values.capacity))[0]!
    const capacity = Math.round(n(bottleneck.values.capacity) * 8 * (n(bottleneck.values.shifts) || 3) * 7 * LINE_EFFICIENCY)
    return Array.from({ length: weeks }, (_, i) => {
      const week = weekOf(plusDays(today, i * 7))
      const orders = list(all, 'bpf.orders').filter((o) => o.values.line === line && LOADING.includes(o.status) && week.includes(String(o.values.planned)))
      const load = orders.reduce((s, o) => s + n(o.values.qty), 0)
      return { line, from: week[0]!, to: week[6]!, capacity, load, orders: orders.length, bottleneck: String(bottleneck.values.name), over: Math.max(0, load - capacity) }
    })
  })
}

/** Why a line cannot take an order in the week it is planned for. */
function capacityProblem(all: All, order: ErpRecord) {
  const planned = String(order.values.planned ?? '')
  if (!planned) return undefined
  const row = capacityLoad(put(all, order), weekOf(planned)[0]!, 1).find((r) => r.line === order.values.line)
  return row && row.over > 0 ? `${row.line} penuh pada minggu ${row.from}: beban ${row.load} t, kapasitas ${row.capacity} t (${row.bottleneck}). Geser tanggal atau pindah lini.` : undefined
}
const put = (all: All, record: ErpRecord): All => ({ ...all, [record.type]: [...list(all, record.type).filter((r) => r.id !== record.id), record] })

/**
 * Finished goods carried at an old standard, trued up to the formula's current standard cost: one journal for the
 * difference and the stock rows that take the new cost. Nothing comes back when every row already sits at standard.
 */
export function finishedRevaluation(all: All, today: string): { posting?: Posting; patches: Effects['patches'] } {
  // Each finished-goods material takes the standard of the first formula that makes it.
  const standardOf = new Map<string, number>()
  for (const f of list(all, 'bpf.formulas')) {
    const fg = finishedGood(all, String(f.values.grade))
    if (fg && !standardOf.has(fg.id) && n(f.values.costPerT)) standardOf.set(fg.id, n(f.values.costPerT))
  }
  const rows = list(all, 'inv.stock').flatMap((row) => {
    const standard = standardOf.get(String(row.values.material)) ?? 0
    const carried = n(row.values.avgCost)
    return standard && carried && standard !== carried && n(row.values.onHand) > 0 ? [{ row, standard, change: Math.round(n(row.values.onHand) * (standard - carried)) }] : []
  })
  const change = rows.reduce((s, r) => s + r.change, 0)
  const posting = compose(all, { description: `Revaluasi barang jadi ke standar baru ${today}`, entity: 'fertiliser', date: today, source: 'Revaluation', reference: `STD/${today}` }, [signed(POSTING.finished, change), signed(POSTING.revaluation, -change)], `Revaluasi standar ${today}`)
  return { posting, patches: rows.map(({ row, standard }) => ({ type: row.type, id: row.id, values: { avgCost: standard }, action: `Harga standar baru ${rp(standard)}` })) }
}

const head = (record: ErpRecord, source: string, description: string, today: string): Values => ({ description, entity: 'fertiliser', date: today, source, reference: record.id })
const returned = (all: All, type: string, field: string, id: unknown, except: string) => list(all, type).filter((r) => r.values[field] === id && r.id !== except).reduce((s, r) => s + n(r.values.qty), 0)

const ticketsFor = (all: All, field: 'receipt' | 'order', id: string) => list(all, 'wms.weighings').filter((w) => w.values[field] === id)
/** Why a document may not move on its weighbridge tickets: one is still open, or the net weight is off the document quantity. */
function weighProblem(tickets: readonly ErpRecord[], qty: number, what: string) {
  if (!tickets.length) return undefined
  const open = tickets.find((w) => w.status !== 'completed')
  if (open) return `Tiket timbang ${open.id} belum ditimbang kedua kali.`
  const net = tickets.reduce((s, w) => s + n(w.values.net), 0)
  return Math.abs(net - qty) > qty * WEIGH_TOLERANCE ? `Berat bersih timbangan ${net} t berbeda dari ${what} ${qty} t. Sesuaikan jumlahnya dulu.` : undefined
}

/** Budget of a requisition's cost centre against what the year's other requisitions already committed. */
function budgetProblem(pr: ErpRecord, all: All) {
  const centre = find(all, 'mdm.costcenters', pr.values.costcenter)
  const budget = n(centre?.values.budget)
  if (!centre || !budget) return undefined
  const year = String(pr.values.needBy).slice(0, 4)
  const committed = list(all, 'vms.requisitions').filter((r) => r.id !== pr.id && r.values.costcenter === centre.id && ['submitted', 'approved', 'po'].includes(r.status) && String(r.values.needBy).startsWith(year)).reduce((s, r) => s + n(r.values.value), 0)
  return committed + n(pr.values.value) > budget ? `Anggaran ${String(centre.values.name)} ${year} tidak cukup: ${rp(budget)}, sudah terpakai ${rp(committed)}, permintaan ini ${rp(n(pr.values.value))}.` : undefined
}

const DONE_WO = new Set(['completed', 'verified', 'closed', 'cancelled'])

export const PLANT_RULES: Record<string, Rule> = {
  // Lots: a receipt opens a raw-material lot, production draws lots down and opens a finished lot, a shipment draws that down.
  'vms.receipts:accepted': (grn, all, today) => {
    const po = find(all, 'vms.orders', grn.values.po)
    const problem = weighProblem(ticketsFor(all, 'receipt', grn.id), n(grn.values.qty), 'penerimaan')
    if (problem) return { blocker: problem }
    const bin = list(all, 'wms.bins')[0]
    if (!po || !bin) return undefined
    const lotNo = `RM-${grn.id}`
    return { creates: [{ type: 'wms.lots', values: { lotNo, bin: bin.id, material: po.values.material, zone: bin.values.zone, qty: n(grn.values.qty), expiry: plusDays(today, 365), receipt: grn.id } }, movement('Receipt', lotNo, po.values.material, n(grn.values.qty), grn.id, today)] }
  },
  'bpf.orders:running': (order, all, today) => {
    const taken = bomNeeds(all, order).flatMap((need) => allocate(rawLots(all, need.material), need.qty, 'qty').map((a) => ({ ...a, material: need.material })))
    return {
      patches: taken.map(({ lot, take }) => ({ type: lot.type, id: lot.id, values: { qty: Math.round((n(lot.values.qty) - take) * 1000) / 1000 }, action: `Dipakai ${take} untuk ${order.id}` })),
      creates: taken.map(({ lot, take, material }) => movement('Consumption', String(lot.values.lotNo), material, take, order.id, today)),
    }
  },
  'bpf.orders:completed': (order, all, today) => {
    const output = n(order.values.output) || n(order.values.qty)
    const grade = String(find(all, 'bpf.formulas', order.values.formula)?.values.grade ?? '')
    const fg = finishedGood(all, grade)
    if (!fg) return undefined
    const lotNo = `FG-${order.id}`
    // A batch stays on hold until the lab approves a sample of it.
    const approved = list(all, 'qc.samples').some((s) => s.values.order === order.id && s.status === 'approved')
    return { creates: [{ type: 'gtr.lots', status: approved ? 'released' : 'hold', values: { lotNo, product: grade, produced: today, qty: output, remaining: output, material: fg.id, order: order.id } }, movement('Production', lotNo, fg.id, output, order.id, today)] }
  },
  'qc.samples:approved': (sample, all) => ({ moves: list(all, 'gtr.lots').filter((l) => l.values.order === sample.values.order && l.status === 'hold').map((l) => ({ type: l.type, id: l.id, status: 'released', action: `Sampel ${sample.id} lulus` })) }),
  'qc.samples:rejected': (sample, all) => {
    const order = find(all, 'bpf.orders', sample.values.order)
    const defect = list(all, 'mes.defects')[0]
    const held = list(all, 'mes.holds').some((h) => h.values.order === sample.values.order && h.status === 'active')
    return {
      moves: list(all, 'gtr.lots').filter((l) => l.values.order === sample.values.order && l.status === 'released').map((l) => ({ type: l.type, id: l.id, status: 'hold', action: `Sampel ${sample.id} gagal` })),
      creates: order && defect && !held ? [{ type: 'mes.holds', values: { order: order.id, defect: defect.id, qty: n(order.values.output) || n(order.values.qty) } }] : [],
    }
  },
  'dms.orders:shipped': (so, all, today) => {
    const qty = n(so.values.qty)
    const problem = weighProblem(ticketsFor(all, 'order', so.id), qty, 'pesanan')
    if (problem) return { blocker: problem }
    const fg = finishedGood(all, String(so.values.product))
    if (!fg) return undefined
    const { cleared, held } = finishedLots(all, fg.id)
    const stock = list(all, 'inv.stock').filter((s) => s.values.material === fg.id && s.status !== 'inactive').reduce((s, r) => s + n(r.values.onHand), 0)
    if (held > 0 && qty > stock - held) return { blocker: `${held} t ${String(fg.values.name)} masih ditahan mutu atau belum ber-COA. Yang boleh dikirim ${Math.max(0, stock - held)} t.` }
    const taken = allocate(cleared, qty, 'remaining')
    return {
      patches: taken.map(({ lot, take }) => ({ type: lot.type, id: lot.id, values: { remaining: Math.round((n(lot.values.remaining) - take) * 1000) / 1000 }, action: `Dikirim ${take} untuk ${so.id}` })),
      creates: taken.map(({ lot, take }) => movement('Shipment', String(lot.values.lotNo), fg.id, take, so.id, today)),
    }
  },

  // Weighbridge: the second weighing sets the net weight, which becomes the quantity of an open goods receipt.
  'wms.weighings:completed': (w, all) => {
    if (!n(w.values.tare) || n(w.values.tare) >= n(w.values.gross)) return { blocker: 'Isi berat kosong (tara) yang lebih kecil dari berat kotor sebelum menutup tiket.' }
    const grn = find(all, 'vms.receipts', w.values.receipt)
    return grn && ['received', 'quarantine'].includes(grn.status) ? { patches: [{ type: grn.type, id: grn.id, values: { qty: n(w.values.net) }, action: `Jumlah mengikuti timbangan ${w.id}: ${n(w.values.net)} t` }] } : undefined
  },

  // Turnarounds: work orders report into their package.
  'eam.workorders:created': (wo, all) => {
    const tar = find(all, 'eam.turnarounds', wo.values.turnaround)
    if (!tar) return undefined
    return tar.status === 'closed' ? { blocker: `${tar.id} sudah ditutup.` } : { patches: [{ type: tar.type, id: tar.id, values: { planned: n(tar.values.planned) + 1 }, action: `Work order ${wo.id} ditambahkan` }] }
  },
  'eam.workorders:completed': (wo, all) => {
    const tar = find(all, 'eam.turnarounds', wo.values.turnaround)
    return tar ? { patches: [{ type: tar.type, id: tar.id, values: { done: n(tar.values.done) + 1, actual: n(tar.values.actual) + n(wo.values.cost) }, action: `${wo.id} selesai, biaya ${rp(n(wo.values.cost))}` }] } : undefined
  },
  'eam.turnarounds:closed': (tar, all) => {
    const open = list(all, 'eam.workorders').filter((w) => w.values.turnaround === tar.id && !DONE_WO.has(w.status))
    return open.length ? { blocker: `${open.length} work order shutdown belum selesai, mulai dari ${open[0]!.id}.` } : undefined
  },

  // Capacity: a line takes an order only while the week still has room.
  'bpf.orders:released': (order, all) => (capacityProblem(all, order) ? { blocker: capacityProblem(all, order) } : undefined),

  // Returns: goods going back to the vendor leave stock, their lot and the accrual; goods coming back from a customer re-enter stock.
  'vms.returns:shipped': (ret, all, today) => {
    const grn = find(all, 'vms.receipts', ret.values.receipt)
    const po = find(all, 'vms.orders', grn?.values.po)
    if (!grn || !po) return undefined
    const qty = n(ret.values.qty)
    const left = n(grn.values.qty) - returned(all, ret.type, 'receipt', grn.id, ret.id)
    if (qty > left) return { blocker: `Retur ${qty} melebihi sisa ${grn.id}: ${left}.` }
    const value = Math.round((n(po.values.value) / Math.max(1, n(po.values.qty))) * qty)
    const lot = list(all, 'wms.lots').find((l) => l.values.receipt === grn.id)
    const posting = compose(all, head(ret, 'Goods receipt', `Retur ke pemasok ${ret.id} dari ${grn.id}`, today), [[POSTING.grir, value, 0], [POSTING.inventory, 0, value]], ret.id)
    return {
      patches: [...moveStock(all, po.values.material, qty, `Diretur ${qty} lewat ${ret.id}`), ...(lot ? [{ type: lot.type, id: lot.id, values: { qty: Math.max(0, n(lot.values.qty) - qty) }, action: `Diretur ${qty} lewat ${ret.id}` }] : [])],
      creates: [movement('Return to vendor', String(lot?.values.lotNo ?? `RM-${grn.id}`), po.values.material, qty, ret.id, today)],
      postings: posting ? [posting] : [],
    }
  },
  'dms.returns:created': (ret, all) => {
    const so = find(all, 'dms.orders', ret.values.order)
    if (!so || !['shipped', 'delivered'].includes(so.status)) return { blocker: 'Retur hanya untuk pesanan yang sudah dikirim.' }
    const left = n(so.values.qty) - returned(all, ret.type, 'order', so.id, ret.id)
    return n(ret.values.qty) > left ? { blocker: `Retur melebihi yang dikirim lewat ${so.id}: sisa ${left} t.` } : undefined
  },
  'dms.returns:received': (ret, all, today) => {
    const so = find(all, 'dms.orders', ret.values.order)
    const fg = so && finishedGood(all, String(so.values.product))
    if (!so || !fg) return undefined
    const qty = n(ret.values.qty)
    const unit = Math.round(finishedCost(all, String(so.values.product)))
    const lotNo = `RET-${ret.id}`
    // Restocked goods come back at cost and reverse the cost of sales; scrapped goods stay expensed.
    if (ret.values.disposition !== 'Restock') return { creates: [movement('Customer return', lotNo, fg.id, qty, so.id, today)] }
    const posting = compose(all, head(ret, 'Cost of sales', `Retur pelanggan ${ret.id} dari ${so.id}`, today), [[POSTING.finished, unit * qty, 0], [POSTING.cogs.fertiliser!, 0, unit * qty]], ret.id)
    return { patches: receiveStock(all, fg.id, qty, unit, `Retur ${qty} dari ${so.id}`), creates: [movement('Customer return', lotNo, fg.id, qty, so.id, today)], postings: posting ? [posting] : [] }
  },
  'dms.returns:credited': (ret, all) => {
    const so = find(all, 'dms.orders', ret.values.order)
    const invoice = list(all, 'fin.receivables').find((r) => r.values.salesOrder === so?.id && ['issued', 'overdue'].includes(r.status))
    if (!so || !invoice) return { blocker: 'Belum ada faktur terbuka untuk pesanan ini. Nota kredit butuh faktur yang belum lunas.' }
    const amount = Math.round((n(so.values.value) / Math.max(1, n(so.values.qty))) * n(ret.values.qty))
    return { creates: [{ type: 'fin.creditnotes', status: 'submitted', values: { invoice: invoice.id, amount, reason: `Retur ${ret.id}: ${String(ret.values.reason)}` } }] }
  },

  // Consignment: the distributor's sales report turns consigned stock into cost of sales.
  'dms.sellthrough:created': (rep, all) => {
    const so = find(all, 'dms.orders', rep.values.order)
    if (!so || so.values.terms !== 'Consignment' || !['shipped', 'delivered'].includes(so.status)) return { blocker: 'Laporan penjualan hanya untuk pesanan konsinyasi yang sudah dikirim.' }
    const left = n(so.values.qty) - n(so.values.sold)
    return n(rep.values.qty) > left ? { blocker: `Terjual ${n(rep.values.qty)} t melebihi sisa konsinyasi ${so.id}: ${left} t.` } : undefined
  },
  'dms.sellthrough:reported': (rep, all, today) => {
    const so = find(all, 'dms.orders', rep.values.order)
    if (!so) return undefined
    const qty = n(rep.values.qty)
    if (qty > n(so.values.qty) - n(so.values.sold)) return { blocker: `Terjual ${qty} t melebihi sisa konsinyasi ${so.id}.` }
    const cost = Math.round(finishedCost(all, String(so.values.product)) * qty)
    const posting = compose(all, head(rep, 'Cost of sales', `Penjualan konsinyasi ${rep.id} dari ${so.id}`, today), [[POSTING.cogs.fertiliser!, cost, 0], [POSTING.consignment, 0, cost]], rep.id)
    return { patches: [{ type: so.type, id: so.id, values: { sold: n(so.values.sold) + qty }, action: `Terjual ${qty} t lewat ${rep.id}` }], postings: posting ? [posting] : [] }
  },

  // Outline contracts: a call-off takes the contract's vendor, material and price, within its quantity and validity.
  'vms.orders:created': (po, all, today) => {
    const contract = find(all, 'vms.contracts', po.values.contract)
    if (!contract) return undefined
    if (contract.status !== 'approved' || String(contract.values.validTo) < today) return { blocker: `${contract.id} belum disetujui atau sudah lewat masa berlaku ${String(contract.values.validTo)}.` }
    if (contract.values.vendor !== po.values.vendor || (contract.values.material && contract.values.material !== po.values.material)) return { blocker: `Pemasok atau bahan PO berbeda dengan ${contract.id}.` }
    const quota = n(contract.values.quota)
    const called = list(all, 'vms.orders').filter((o) => o.values.contract === contract.id && o.id !== po.id && o.status !== 'rejected').reduce((s, o) => s + n(o.values.qty), 0)
    if (quota && called + n(po.values.qty) > quota) return { blocker: `Kuota ${contract.id} tidak cukup: ${quota} t, sudah dipanggil ${called} t.` }
    const price = n(contract.values.price)
    return price ? { patches: [{ type: po.type, id: po.id, values: { value: Math.round(price * n(po.values.qty)) }, action: `Harga kontrak ${contract.id}: ${rp(price)} per satuan` }] } : undefined
  },

  // Budget check on purchase requisitions.
  'vms.requisitions:submitted': (pr, all) => (budgetProblem(pr, all) ? { blocker: budgetProblem(pr, all) } : undefined),
  'vms.requisitions:approved': (pr, all) => (budgetProblem(pr, all) ? { blocker: budgetProblem(pr, all) } : undefined),
}

const OPEN_PR = ['draft', 'submitted', 'approved']
const PLANNED = ['planned', 'released']

/**
 * Material requirements for the production orders planned within the horizon: needs from each order's bill of
 * materials against stock on hand plus what purchase orders and requisitions already bring in. A shortage comes with
 * the requisition that covers it, due on the first day the material is needed.
 */
export function mrpRun(all: All, today: string, horizonDays = 14) {
  const until = plusDays(today, horizonDays)
  const orders = list(all, 'bpf.orders').filter((o) => PLANNED.includes(o.status) && String(o.values.planned) <= until)
  const need = new Map<string, { qty: number; first: string; batches: Set<string> }>()
  for (const o of orders) {
    for (const x of bomNeeds(all, o)) {
      const row = need.get(x.material) ?? { qty: 0, first: String(o.values.planned), batches: new Set<string>() }
      need.set(x.material, { qty: Math.round((row.qty + x.qty) * 1000) / 1000, first: row.first < String(o.values.planned) ? row.first : String(o.values.planned), batches: row.batches.add(o.id) })
    }
  }
  const received = (po: string) => list(all, 'vms.receipts').filter((g) => g.values.po === po && g.status === 'accepted').reduce((s, g) => s + n(g.values.qty), 0)
  return [...need].map(([material, r]) => {
    const onHand = list(all, 'inv.stock').filter((s) => s.values.material === material && s.status !== 'inactive').reduce((s, x) => s + n(x.values.onHand), 0)
    const onOrder = list(all, 'vms.orders').filter((p) => p.values.material === material && ['submitted', 'released'].includes(p.status)).reduce((s, p) => s + Math.max(0, n(p.values.qty) - received(p.id)), 0)
    const requested = list(all, 'vms.requisitions').filter((p) => p.values.material === material && OPEN_PR.includes(p.status)).reduce((s, p) => s + n(p.values.qty), 0)
    const shortage = Math.max(0, Math.round((r.qty - onHand - onOrder - requested) * 1000) / 1000)
    const name = String(find(all, 'mdm.materials', material)?.values.name ?? material)
    const requisition: Values | undefined = shortage ? { title: `MRP: ${name} untuk ${r.batches.size} batch`, material, qty: Math.ceil(shortage), entity: 'fertiliser', value: Math.ceil(shortage) * averageCost(all, material), needBy: r.first < today ? today : r.first } : undefined
    return { material, name, need: r.qty, first: r.first, orders: r.batches.size, onHand, onOrder, requested, shortage, requisition }
  }).sort((a, b) => b.shortage - a.shortage || a.name.localeCompare(b.name))
}

/** Everything recorded about a lot or a document: the movements that name it, and for a finished lot the lots it was made from. */
export function traceLot(all: All, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return { movements: [], sources: [], destinations: [] }
  const moves = list(all, 'gtr.movements')
  const movements = moves.filter((m) => String(m.values.lotNo).toLowerCase() === q || String(m.values.document).toLowerCase() === q)
  // Backward: the production order that made a finished lot consumed these raw-material lots.
  const madeBy = movements.filter((m) => m.values.kind === 'Production').map((m) => m.values.document)
  const sources = moves.filter((m) => m.values.kind === 'Consumption' && madeBy.includes(m.values.document))
  // Forward: a raw-material lot went into these orders, whose finished lots went to these shipments.
  const usedIn = movements.filter((m) => m.values.kind === 'Consumption').map((m) => m.values.document)
  const made = moves.filter((m) => m.values.kind === 'Production' && usedIn.includes(m.values.document)).map((m) => m.values.lotNo)
  const destinations = moves.filter((m) => m.values.kind === 'Shipment' && made.includes(m.values.lotNo))
  return { movements, sources, destinations }
}
