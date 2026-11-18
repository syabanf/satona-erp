/**
 * Plant-floor controls layered on the document rules in `effects.ts`: lot tracking from receipt to shipment, quality
 * holds and the COA gate, weighbridge tickets, metered energy, turnaround packages and the budget check on requisitions.
 * A rule here adds to the base rule of the same step; a blocker from either stops the step.
 */
import { averageCost, bomNeeds, CONVERSION, finishedCost, finishedGood, moveStock, receiveStock, shipGoods, unshipped, type Effects } from './effects'
import { compose, costCentreSpend, POSTING, signed, type Posting } from './ledger'
import type { ErpRecord, Values } from './records'
import { leaveBalance, weekOf } from './selfService'

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

const blocked = (reason: string | undefined) => (reason ? { blocker: reason } : undefined)

/** Finished lots a shipment of `qty` draws from, oldest first; refuses stock that quality still holds. */
function shipLots(so: ErpRecord, qty: number, doc: ErpRecord, all: All, today: string): Partial<Effects> | undefined {
  const fg = finishedGood(all, String(so.values.product))
  if (!fg) return undefined
  const { cleared, held } = finishedLots(all, fg.id)
  const stock = list(all, 'inv.stock').filter((s) => s.values.material === fg.id && s.status !== 'inactive').reduce((s, r) => s + n(r.values.onHand), 0)
  if (held > 0 && qty > stock - held) return { blocker: `${held} t ${String(fg.values.name)} masih ditahan mutu atau belum ber-COA. Yang boleh dikirim ${Math.max(0, stock - held)} t.` }
  const taken = allocate(cleared, qty, 'remaining')
  return {
    patches: taken.map(({ lot, take }) => ({ type: lot.type, id: lot.id, values: { remaining: Math.round((n(lot.values.remaining) - take) * 1000) / 1000 }, action: `Dikirim ${take} untuk ${doc.id}` })),
    creates: taken.map(({ lot, take }) => movement('Shipment', String(lot.values.lotNo), fg.id, take, doc.id, today)),
  }
}

/** The opposite entry of every posted journal that points at one of `references` and was not reversed before. */
function reverseJournals(all: All, references: readonly string[], today: string, only: (journal: ErpRecord) => boolean = () => true): Posting[] {
  const journals = list(all, 'fin.journals')
  return journals.filter((j) => j.status === 'posted' && references.includes(String(j.values.reference)) && only(j) && !journals.some((r) => r.values.reference === `REV/${j.id}`)).map((j) => ({
    journal: { description: `Pembatalan ${String(j.values.description)}`, entity: j.values.entity, date: today, source: j.values.source, reference: `REV/${j.id}`, amount: j.values.amount },
    lines: list(all, 'fin.journallines').filter((l) => l.values.journal === j.id).map((l) => ({ account: l.values.account, costcenter: l.values.costcenter, debit: n(l.values.credit), credit: n(l.values.debit), memo: `Pembatalan ${j.id}` })),
  }))
}

/** Gives lots back what the movements of `kind` for these documents took, and records the return as a negative movement. */
function restoreLots(all: All, documents: readonly string[], kind: string, lotType: string, field: string, today: string, doc: string) {
  const back = new Map<string, { qty: number; material: unknown }>()
  for (const m of list(all, 'gtr.movements')) {
    if (m.values.kind !== kind || !documents.includes(String(m.values.document))) continue
    back.set(String(m.values.lotNo), { qty: (back.get(String(m.values.lotNo))?.qty ?? 0) + n(m.values.qty), material: m.values.material })
  }
  const rows = [...back].filter(([, v]) => v.qty > 0).flatMap(([lotNo, v]) => {
    const lot = list(all, lotType).find((l) => l.values.lotNo === lotNo)
    return lot ? [{ lot, lotNo, ...v }] : []
  })
  return {
    patches: rows.map(({ lot, qty }) => ({ type: lot.type, id: lot.id, values: { [field]: Math.round((n(lot.values[field]) + qty) * 1000) / 1000 }, action: `${doc} dibatalkan, ${qty} t kembali` })),
    creates: rows.map(({ lotNo, qty, material }) => movement(kind, lotNo, material, -qty, doc, today)),
  }
}

/** Stock lots of a material that sit in a bin of one of the plant's warehouses and still hold stock. */
function lotsAt(all: All, material: unknown, plant: unknown) {
  const plantOf = (lot: ErpRecord) => find(all, 'wms.warehouses', find(all, 'wms.zones', find(all, 'wms.bins', lot.values.bin)?.values.zone)?.values.warehouse)?.values.plant
  return list(all, 'wms.lots').filter((l) => l.values.material === material && ['received', 'stored'].includes(l.status) && n(l.values.qty) > 0 && plantOf(l) === plant)
}

/**
 * Reopens a completed batch: its output leaves finished stock, its lot is emptied, and the conversion and receipt
 * journals are reversed. The material issue stays, since the batch is running again with the same materials.
 */
function reopenBatch(order: ErpRecord, all: All, today: string): Partial<Effects> {
  const output = n(order.values.output) || n(order.values.qty)
  const fg = finishedGood(all, String(find(all, 'bpf.formulas', order.values.formula)?.values.grade ?? ''))
  const lot = list(all, 'gtr.lots').find((l) => l.values.order === order.id)
  if (lot && n(lot.values.remaining) < n(lot.values.qty)) return { blocker: `Lot ${String(lot.values.lotNo)} sudah dikirim ${n(lot.values.qty) - n(lot.values.remaining)} t, batch tidak bisa dibuka lagi.` }
  const stock = fg ? list(all, 'inv.stock').filter((r) => r.values.material === fg.id && r.status !== 'inactive').reduce((s, r) => s + n(r.values.onHand), 0) : 0
  if (fg && stock < output) return { blocker: `Stok barang jadi tinggal ${stock} t, kurang dari hasil batch ${output} t.` }
  return {
    patches: [
      ...(fg ? moveStock(all, fg.id, output, `Batch ${order.id} dibuka lagi`) : []),
      ...(lot ? [{ type: lot.type, id: lot.id, values: { qty: 0, remaining: 0 }, action: `Batch ${order.id} dibuka lagi` }] : []),
      { type: order.type, id: order.id, values: { output: 0, conversionCost: 0, energyCost: 0, yieldVariance: 0, usageVariance: 0 }, action: 'Batch dibuka lagi' },
    ],
    creates: lot && fg ? [movement('Production', String(lot.values.lotNo), fg.id, -output, order.id, today)] : [],
    moves: lot && lot.status === 'released' ? [{ type: lot.type, id: lot.id, status: 'hold', action: `Batch ${order.id} dibuka lagi` }] : [],
    postings: reverseJournals(all, [order.id], today, (j) => !String(j.values.description).startsWith('Pemakaian bahan')),
  }
}

const SAMPLE_FIELD: Record<string, string> = { 'Total N': 'n', 'P₂O₅': 'p', 'K₂O': 'k', Moisture: 'moisture', 'Granule size 2-4 mm': 'granule', Hardness: 'hardness' }

/** Characteristics of a lab sample that fall outside the inspection plan of its order's formula. */
export function sampleFailures(all: All, sample: ErpRecord) {
  const formula = find(all, 'bpf.orders', sample.values.order)?.values.formula
  return list(all, 'qc.plans').filter((p) => p.values.formula === formula && p.status !== 'inactive' && SAMPLE_FIELD[String(p.values.parameter)]).flatMap((p) => {
    const raw = sample.values[SAMPLE_FIELD[String(p.values.parameter)]!]
    // A characteristic the plan asks for must be measured before the sample can pass.
    if (raw === undefined || raw === '') return [`${String(p.values.parameter)} belum diukur`]
    const value = n(raw)
    const [min, max] = [p.values.min, p.values.max].map((x) => (x === undefined || x === '' ? undefined : Number(x)))
    const low = min !== undefined && value < min
    return low || (max !== undefined && value > max) ? [`${String(p.values.parameter)} ${value} (${low ? `minimum ${min}` : `maksimum ${max}`})`] : []
  })
}

/** Why an annual leave request cannot be filed: it asks for more days than the employee has left this year. */
function leaveProblem(all: All, leave: ErpRecord) {
  const type = find(all, 'hrs.leavetypes', leave.values.leaveType)
  if (!type || !/annual/i.test(String(type.values.name))) return undefined
  const employee = find(all, 'mdm.employees', leave.values.employee)
  const year = String(leave.values.from).slice(0, 4)
  const others = list(all, 'hrs.leaves').filter((l) => l.values.employee === leave.values.employee && l.id !== leave.id)
  const balance = leaveBalance(others, year, { joined: String(employee?.values.joined ?? ''), annualType: type.id })
  const free = balance.left - balance.waiting
  return n(leave.values.days) > free ? `Sisa cuti tahunan ${year} tinggal ${Math.max(0, free)} hari (hak ${balance.entitlement}, terpakai ${balance.taken}, menunggu ${balance.waiting}).` : undefined
}

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
    if (order.status === 'completed') return reopenBatch(order, all, today)
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
  'qc.samples:rejected': (sample, all) => {
    const order = find(all, 'bpf.orders', sample.values.order)
    const defect = list(all, 'mes.defects')[0]
    const held = list(all, 'mes.holds').some((h) => h.values.order === sample.values.order && h.status === 'active')
    return {
      moves: list(all, 'gtr.lots').filter((l) => l.values.order === sample.values.order && l.status === 'released').map((l) => ({ type: l.type, id: l.id, status: 'hold', action: `Sampel ${sample.id} gagal` })),
      creates: order && defect && !held ? [{ type: 'mes.holds', values: { order: order.id, defect: defect.id, qty: n(order.values.output) || n(order.values.qty) } }] : [],
    }
  },
  'dms.orders:shipped': (so, all, today) => blocked(weighProblem(ticketsFor(all, 'order', so.id), n(so.values.qty), 'pesanan')) ?? shipLots(so, unshipped(so), so, all, today),

  // Deliveries: an order ships in parts; each part moves its own stock, lots and cost of sales.
  'dms.deliveries:created': (dlv, all) => {
    const so = find(all, 'dms.orders', dlv.values.order)
    if (!so || so.status !== 'confirmed') return { blocker: 'Pengiriman sebagian hanya untuk pesanan yang sudah dikonfirmasi dan belum terkirim penuh.' }
    const open = list(all, dlv.type).filter((d) => d.values.order === so.id && d.id !== dlv.id && d.status === 'draft').reduce((s, d) => s + n(d.values.qty), 0)
    return n(dlv.values.qty) > unshipped(so) - open ? { blocker: `Pengiriman ${n(dlv.values.qty)} t melebihi sisa ${so.id}: ${unshipped(so) - open} t.` } : undefined
  },
  'dms.deliveries:shipped': (dlv, all, today) => {
    const so = find(all, 'dms.orders', dlv.values.order)
    if (!so || so.status !== 'confirmed') return { blocker: 'Pesanan tidak lagi menunggu pengiriman.' }
    const qty = n(dlv.values.qty)
    if (qty > unshipped(so)) return { blocker: `Pengiriman ${qty} t melebihi sisa ${so.id}: ${unshipped(so)} t.` }
    const parts = [shipGoods(so, qty, dlv, all, today), shipLots(so, qty, dlv, all, today) ?? {}]
    const blocker = parts.find((x) => x.blocker)?.blocker
    if (blocker) return { blocker }
    const total = Math.round((n(so.values.shippedQty) + qty) * 1000) / 1000
    return {
      patches: [...parts.flatMap((x) => x.patches ?? []), { type: so.type, id: so.id, values: { shippedQty: total }, action: `${dlv.id}: ${qty} t dikirim, total ${total} t` }],
      creates: parts.flatMap((x) => x.creates ?? []),
      postings: parts.flatMap((x) => x.postings ?? []),
      moves: total >= n(so.values.qty) ? [{ type: so.type, id: so.id, status: 'shipped', action: `Terkirim penuh lewat ${dlv.id}` }] : [],
    }
  },

  'dms.deliveries:draft': (dlv, all, today) => {
    const so = find(all, 'dms.orders', dlv.values.order)
    if (dlv.status !== 'shipped' || !so) return undefined
    if (so.status === 'delivered') return { blocker: `${so.id} sudah dikonfirmasi sampai. Gunakan retur pelanggan.` }
    if (list(all, 'fin.receivables').some((r) => r.values.delivery === dlv.id)) return { blocker: `${dlv.id} sudah difaktur. Batalkan lewat retur pelanggan dan nota kredit.` }
    const qty = n(dlv.values.qty)
    const left = Math.max(0, Math.round((n(so.values.shippedQty) - qty) * 1000) / 1000)
    const billed = list(all, 'fin.receivables').filter((r) => r.values.salesOrder === so.id).reduce((s, r) => s + n(r.values.amount), 0)
    if (billed > Math.round(n(so.values.value) * (left / Math.max(1, n(so.values.qty))))) return { blocker: `Faktur ${so.id} sudah ${rp(billed)}, lebih dari nilai yang tersisa setelah pembatalan.` }
    const fg = finishedGood(all, String(so.values.product))
    const lots = restoreLots(all, [dlv.id], 'Shipment', 'gtr.lots', 'remaining', today, dlv.id)
    return {
      patches: [...(fg ? receiveStock(all, fg.id, qty, Math.round(finishedCost(all, String(so.values.product))), `Pengiriman ${dlv.id} dibatalkan`) : []), ...lots.patches, { type: so.type, id: so.id, values: { shippedQty: left }, action: `${dlv.id} dibatalkan, terkirim ${left} t` }],
      creates: lots.creates,
      moves: so.status === 'shipped' ? [{ type: so.type, id: so.id, status: 'confirmed', action: `${dlv.id} dibatalkan` }] : [],
      postings: reverseJournals(all, [dlv.id], today),
    }
  },
  // An invoice raised for one delivery bills that delivery's tonnes, once.
  'fin.receivables:created': (invoice, all) => {
    const dlv = find(all, 'dms.deliveries', invoice.values.delivery)
    if (!dlv) return undefined
    const so = find(all, 'dms.orders', dlv.values.order)
    if (dlv.status !== 'shipped' || !so || so.id !== invoice.values.salesOrder) return { blocker: 'Faktur per pengiriman butuh pengiriman yang sudah dikirim dari pesanan yang sama.' }
    if (list(all, 'fin.receivables').some((r) => r.id !== invoice.id && r.values.delivery === dlv.id)) return { blocker: `${dlv.id} sudah punya faktur.` }
    const worth = Math.round((n(so.values.value) / Math.max(1, n(so.values.qty))) * n(dlv.values.qty))
    return n(invoice.values.amount) > worth ? { blocker: `Faktur melebihi nilai ${dlv.id}: ${n(dlv.values.qty)} t senilai ${rp(worth)}.` } : undefined
  },

  // Reversals: a step taken by mistake goes back with its stock, lots and journals.
  'dms.orders:confirmed': (so, all, today) => {
    if (so.status !== 'shipped') return undefined
    if (list(all, 'fin.receivables').some((r) => r.values.salesOrder === so.id)) return { blocker: `${so.id} sudah difaktur. Batalkan lewat retur pelanggan dan nota kredit.` }
    const docs = [so.id, ...list(all, 'dms.deliveries').filter((d) => d.values.order === so.id).map((d) => d.id)]
    const fg = finishedGood(all, String(so.values.product))
    const qty = n(so.values.shippedQty) || n(so.values.qty)
    const lots = restoreLots(all, docs, 'Shipment', 'gtr.lots', 'remaining', today, so.id)
    return {
      patches: [...(fg ? receiveStock(all, fg.id, qty, Math.round(finishedCost(all, String(so.values.product))), `Pengiriman ${so.id} dibatalkan`) : []), ...lots.patches, { type: so.type, id: so.id, values: { shippedQty: 0 }, action: 'Pengiriman dibatalkan' }],
      creates: lots.creates,
      postings: reverseJournals(all, docs, today),
    }
  },
  'vms.receipts:quarantine': (grn, all, today) => {
    if (grn.status !== 'accepted') return undefined
    const po = find(all, 'vms.orders', grn.values.po)
    if (!po) return undefined
    const qty = n(grn.values.qty)
    const lot = list(all, 'wms.lots').find((l) => l.values.receipt === grn.id)
    if (lot && n(lot.values.qty) < qty) return { blocker: `Lot ${String(lot.values.lotNo)} sudah dipakai ${qty - n(lot.values.qty)} t, penerimaan tidak bisa dibatalkan. Gunakan retur ke pemasok.` }
    const stock = list(all, 'inv.stock').filter((r) => r.values.material === po.values.material && r.status !== 'inactive').reduce((s, r) => s + n(r.values.onHand), 0)
    if (stock < qty) return { blocker: `Stok tinggal ${stock}, kurang dari ${qty} yang mau dibatalkan.` }
    return {
      patches: [...moveStock(all, po.values.material, qty, `Penerimaan ${grn.id} dibatalkan`), ...(lot ? [{ type: lot.type, id: lot.id, values: { qty: 0 }, action: `Penerimaan ${grn.id} dibatalkan` }] : [])],
      creates: lot ? [movement('Receipt', String(lot.values.lotNo), po.values.material, -qty, grn.id, today)] : [],
      moves: po.status === 'closed' ? [{ type: po.type, id: po.id, status: 'released', action: `Penerimaan ${grn.id} dibatalkan` }] : [],
      postings: reverseJournals(all, [grn.id], today),
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
  'bpf.orders:released': (order, all, today) => {
    if (order.status !== 'running') return blocked(capacityProblem(all, order))
    // Cancelling a running batch puts its materials back: stock at the cost it left with, lots by their consumption.
    const lots = restoreLots(all, [order.id], 'Consumption', 'wms.lots', 'qty', today, order.id)
    return {
      patches: [...bomNeeds(all, order).flatMap((x) => receiveStock(all, x.material, x.qty, Math.round(x.cost / Math.max(0.001, x.qty)), `Batch ${order.id} dibatalkan`)), ...lots.patches, { type: order.type, id: order.id, values: { materialCost: 0 }, action: 'Batch dibatalkan, bahan kembali ke stok' }],
      creates: lots.creates,
      postings: reverseJournals(all, [order.id], today),
    }
  },

  // Quality: the lab releases a sample only when every measured characteristic sits inside its inspection plan.
  'qc.samples:approved': (sample, all) => {
    const failures = sampleFailures(all, sample)
    if (failures.length) return { blocker: `Sampel di luar spesifikasi: ${failures.join('; ')}. Tolak sampelnya atau uji ulang.` }
    return { moves: list(all, 'gtr.lots').filter((l) => l.values.order === sample.values.order && l.status === 'hold').map((l) => ({ type: l.type, id: l.id, status: 'released', action: `Sampel ${sample.id} lulus` })) }
  },

  // Stock count: starting a count lists every stock row of the plant; review values the differences; posting sets stock to the count.
  'inv.counts:counting': (count, all) => ({
    // A material kept in lots is counted lot by lot in its bin; one without lots is counted as a single balance.
    creates: list(all, 'inv.stock').filter((r) => r.values.plant === count.values.plant && r.status !== 'inactive').flatMap((r) => {
      const line = (system: number, extra: Values = {}) => ({ type: 'inv.countlines', values: { count: count.id, stock: r.id, system, counted: system, unitCost: n(r.values.avgCost), ...extra } })
      const lots = lotsAt(all, r.values.material, count.values.plant)
      return lots.length ? lots.map((l) => line(n(l.values.qty), { lot: l.id, bin: String(find(all, 'wms.bins', l.values.bin)?.values.bin ?? l.values.bin) })) : [line(n(r.values.onHand))]
    }),
  }),
  'inv.counts:review': (count, all) => {
    const lines = list(all, 'inv.countlines').filter((l) => l.values.count === count.id)
    if (!lines.length) return undefined
    const system = lines.reduce((s, l) => s + n(l.values.system), 0)
    const value = lines.reduce((s, l) => s + n(l.values.value), 0)
    return { patches: [{ type: count.type, id: count.id, values: { items: lines.length, value, variance: Math.round((Math.abs(lines.reduce((s, l) => s + n(l.values.difference), 0)) / Math.max(1, system)) * 10000) / 100 }, action: `Selisih ${rp(value)} dari ${lines.length} barang` }] }
  },
  'inv.counts:posted': (count, all) => {
    const lines = list(all, 'inv.countlines').filter((l) => l.values.count === count.id && n(l.values.difference) !== 0)
    // Each lot takes its own count; the stock balance moves by the sum of its lines' differences.
    const byStock = new Map<string, number>()
    for (const l of lines) byStock.set(String(l.values.stock), (byStock.get(String(l.values.stock)) ?? 0) + n(l.values.difference))
    return {
      patches: [
        ...lines.filter((l) => l.values.lot).map((l) => ({ type: 'wms.lots', id: String(l.values.lot), values: { qty: n(l.values.counted) }, action: `Stok opname ${count.id}: ${n(l.values.system)} menjadi ${n(l.values.counted)}` })),
        ...[...byStock].map(([id, difference]) => ({ type: 'inv.stock', id, values: { onHand: Math.max(0, Math.round((n(find(all, 'inv.stock', id)?.values.onHand) + difference) * 1000) / 1000) }, action: `Stok opname ${count.id}: selisih ${difference}` })),
      ],
    }
  },

  // Leave: annual leave cannot exceed what the employee has left this year.
  'hrs.leaves:created': (leave, all) => blocked(leaveProblem(all, leave)),
  'hrs.leaves:submitted': (leave, all) => blocked(leaveProblem(all, leave)),


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
