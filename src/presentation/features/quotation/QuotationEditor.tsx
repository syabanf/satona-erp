import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { QUOTE_PRODUCTS, QUOTE_UNITS } from '@/domain/catalog/rotama'
import { canCreate, type ErpRecord, type Values } from '@/domain/records'
import { cn } from '@/lib/cn'
import { money } from '@/lib/format'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import { PageBar } from '../../ui/PageBar'
import { Popover } from '../../ui/Popover'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/useToast'
import { recordPath } from '../../records/text'

const QUOTE = typeOf('fbl.quotations')!
const PPN = 11

interface Line {
  key: number
  item: string
  unit: string
  qty: number
  price: number
}
type Header = Record<'customer' | 'branch' | 'inquiry' | 'title' | 'pic' | 'phone' | 'email' | 'loadDate' | 'unloadDate' | 'validTo' | 'origin' | 'destination' | 'notes', string>
const EMPTY: Header = { customer: '', branch: '', inquiry: '', title: '', pic: '', phone: '', email: '', loadDate: '', unloadDate: '', validTo: '', origin: '', destination: '', notes: '' }
const REQUIRED: ReadonlyArray<[keyof Header, string]> = [
  ['customer', 'Pelanggan'],
  ['branch', 'Cabang'],
  ['title', 'Layanan'],
  ['pic', 'PIC'],
  ['phone', 'Telp / HP'],
  ['email', 'Email'],
  ['loadDate', 'Tanggal muat'],
]

const lineInput = 'h-9 w-full min-w-0 border-b border-line-strong bg-transparent text-sm text-fg outline-none placeholder:text-subtle focus:border-accent'
const v = (r: ErpRecord | undefined, k: string) => String(r?.values[k] ?? '')

function Row({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <span className="text-[11px] font-semibold tracking-wide text-muted uppercase italic">
        {label}
        {required && <span className="text-accent">*</span>}
      </span>
      {children}
    </label>
  )
}

function Picker({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }>; placeholder: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-line-strong bg-card px-3 text-base text-fg md:text-sm">
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Creates a customer quotation as the document the customer receives: pick the customer and branch (or pull an inquiry),
 * fill the letterhead form, add lines from the service list or rate cards, then set discount and PPN.
 * Saving creates the quotation, one quotation line per row, and marks a pulled inquiry as quoted.
 */
export default function QuotationEditor() {
  const { records } = useServices()
  const { role } = useSession()
  const access = useAccess()(QUOTE.module)
  const all = useAllRecords()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [head, setHead] = useState<Header>(() => ({ ...EMPTY, customer: params.get('customer') ?? '' }))
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState(0)
  const [ppn, setPpn] = useState(true)
  const [missing, setMissing] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [nextKey, setNextKey] = useState(1)

  if (!canCreate(QUOTE, access)) return <EmptyState title={`${role.name} tidak bisa membuat penawaran`}>Akses Anda ke modul ini hanya baca.</EmptyState>
  if (!all.data) return <CardSkeleton lines={8} />
  const data = all.data
  const rows = (key: string) => data[key] ?? []

  const set = (k: keyof Header, value: string) => setHead((h) => ({ ...h, [k]: value }))
  const add = (line: Omit<Line, 'key'>) => {
    setLines((ls) => [...ls, { ...line, key: nextKey }])
    setNextKey((k) => k + 1)
  }
  const edit = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const customers = rows('mdm.partners').filter((p) => p.values.kind !== 'Vendor')
  const branches = rows('tms.locations').filter((l) => l.values.kind === 'Depot')
  const inquiries = rows('fbl.inquiries').filter((q) => q.status === 'new' && (!head.customer || q.values.customer === head.customer))
  const lanes = rows('tms.lanes')
  const rateItems = rows('fbl.rates').map((r) => {
    const lane = lanes.find((l) => l.values.name === r.values.route)
    return { item: `Angkutan ${v(r, 'route')}`, unit: 'trip', price: Math.round(Number(r.values.price) * Number(lane?.values.distance ?? 300)) }
  })
  const customer = customers.find((c) => c.id === head.customer)
  const nextNo = `${QUOTE.prefix}-${String(rows(QUOTE.key).length + 1).padStart(4, '0')}`

  // Pulling an inquiry fills the customer, contact, route, date and a first line priced from the service list.
  const pull = (id: string) => {
    const q = rows('fbl.inquiries').find((x) => x.id === id)
    if (!q) return set('inquiry', '')
    const lane = lanes.find((l) => l.id === q.values.lane)
    const [origin = '', destination = ''] = v(lane, 'name').split(' → ')
    const product = QUOTE_PRODUCTS.find((p) => p.item.startsWith(v(q, 'service').split(' ')[0] ?? '')) ?? QUOTE_PRODUCTS[0]!
    setHead((h) => ({ ...h, inquiry: id, customer: v(q, 'customer'), title: `${v(q, 'service')}, ${v(lane, 'name')}`, pic: v(q, 'pic'), phone: v(q, 'phone'), email: v(q, 'email'), loadDate: v(q, 'needed'), origin, destination, notes: `${v(q, 'commodity')}. ${v(q, 'notes')}`.trim() }))
    setLines([{ key: nextKey, item: `${product.item}, ${v(q, 'commodity')}`, unit: 'trip', qty: Number(q.values.trips) || 1, price: product.price }])
    setNextKey((k) => k + 1)
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0)
  const tax = ppn ? Math.round((subtotal - discount) * (PPN / 100)) : 0
  const total = subtotal - discount + tax

  async function save() {
    const gaps = REQUIRED.filter(([k]) => !head[k]).map(([, label]) => label)
    if (!lines.length) gaps.push('minimal satu produk')
    setMissing(gaps)
    if (gaps.length) return toast({ title: 'Penawaran belum lengkap', description: `Isi ${gaps.join(', ')}.`, tone: 'danger' })
    setBusy(true)
    try {
      const values: Values = { ...head, subtotal, discount, ppnRate: ppn ? PPN : 0 }
      const saved = await records.create(role, QUOTE.key, values)
      for (const l of lines) await records.create(role, 'fbl.quotelines', { quotation: saved.id, item: l.item, unit: l.unit, qty: l.qty, price: l.price })
      if (head.inquiry) await records.transition(role, 'fbl.inquiries', head.inquiry, 'quoted').catch(() => undefined)
      toast({ title: `Penawaran ${saved.id} dibuat`, description: `${lines.length} produk, total ${money(total)}.` })
      navigate(recordPath(QUOTE, saved.id), { replace: true })
    } catch (e) {
      toast({ title: 'Penawaran tidak tersimpan', description: e instanceof Error ? e.message : String(e), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const bad = (label: string) => missing.includes(label) && 'border-danger'

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageBar fallback={recordPath(QUOTE)} label="Penawaran" />

      <section aria-label="Sumber penawaran" className="grid gap-4 rounded-card border border-info/40 bg-info-soft p-4 sm:grid-cols-3 sm:p-5">
        <Picker label="Pelanggan *" value={head.customer} onChange={(c) => setHead((h) => ({ ...h, customer: c, inquiry: '' }))} placeholder="Pilih pelanggan" options={customers.map((c) => ({ value: c.id, label: v(c, 'name') }))} />
        <Picker label="Cabang *" value={head.branch} onChange={(b) => set('branch', b)} placeholder="Pilih cabang" options={branches.map((b) => ({ value: b.id, label: v(b, 'name') }))} />
        <Picker label="Tarik dari inquiry" value={head.inquiry} onChange={pull} placeholder={inquiries.length ? 'Pilih inquiry' : 'Tidak ada inquiry baru'} options={inquiries.map((q) => ({ value: q.id, label: `${q.id} · ${v(q, 'commodity')}` }))} />
      </section>

      <article className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7">
          <BrandMark className="size-20" />
          <div className="min-w-0 text-right">
            <p className="text-xl font-bold tracking-tight">PT ROTAMA INDONESIA</p>
            <p className="mt-1 text-xs text-muted italic">Jl. Raya Anyer KM 10, Cilegon, Banten 42445</p>
            <p className="mt-1 text-xs text-accent-text">sales@rotama.co.id</p>
            <p className="mt-1 text-xs text-muted">NPWP: 01.234.567.8-417.000</p>
          </div>
        </header>
        <div className="border-y border-line bg-raised px-5 py-4 text-center">
          <p className="text-lg font-semibold tracking-[0.2em]">QUOTATION</p>
          <p className="mt-1 text-xs text-muted">
            Nomor: <span className="font-mono text-fg">{head.branch ? nextNo : 'Pilih cabang dulu'}</span>
          </p>
        </div>

        <div className="grid gap-x-8 gap-y-3 p-5 sm:p-7 md:grid-cols-2">
          <div className="space-y-3">
            <Row label="Layanan" required>
              <input value={head.title} onChange={(e) => set('title', e.target.value)} placeholder="Misal: Bulk liquid tanker, Cilegon → Cikampek" className={cn(lineInput, bad('Layanan'))} />
            </Row>
            <Row label="Client" required>
              <span className={cn(lineInput, 'flex items-center truncate', !customer && 'text-subtle', bad('Pelanggan'))}>{customer ? v(customer, 'name') : 'Pilih di atas'}</span>
            </Row>
            <Row label="PIC" required>
              <input value={head.pic} onChange={(e) => set('pic', e.target.value)} placeholder="Nama PIC" className={cn(lineInput, bad('PIC'))} />
            </Row>
            <Row label="Telp / HP" required>
              <input type="tel" value={head.phone} onChange={(e) => set('phone', e.target.value)} placeholder="081234567890" className={cn(lineInput, bad('Telp / HP'))} />
            </Row>
            <Row label="Email" required>
              <input type="email" value={head.email} onChange={(e) => set('email', e.target.value)} placeholder="nama@email.com" className={cn(lineInput, bad('Email'))} />
            </Row>
          </div>
          <div className="space-y-3">
            <Row label="Tanggal muat" required>
              <input type="date" value={head.loadDate} onChange={(e) => set('loadDate', e.target.value)} className={cn(lineInput, bad('Tanggal muat'))} />
            </Row>
            <Row label="Tanggal bongkar">
              <input type="date" value={head.unloadDate} onChange={(e) => set('unloadDate', e.target.value)} className={lineInput} />
            </Row>
            <Row label="Asal">
              <input value={head.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Cilegon" className={lineInput} />
            </Row>
            <Row label="Tujuan">
              <input value={head.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Cikampek" className={lineInput} />
            </Row>
            <Row label="Berlaku sampai">
              <input type="date" value={head.validTo} onChange={(e) => set('validTo', e.target.value)} className={lineInput} />
            </Row>
          </div>
        </div>
      </article>

      <section aria-labelledby="lines-title" className="rounded-card border border-line bg-card p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="lines-title" className="text-lg font-semibold">
            Produk dan layanan <span className="text-sm font-normal text-muted">({lines.length})</span>
          </h2>
          <div className="ml-auto flex gap-2">
            <Button variant="card" size="sm" onClick={() => add({ item: '', unit: 'trip', qty: 1, price: 0 })}>
              <Plus aria-hidden className="size-4" /> Baris kosong
            </Button>
            <Popover
              width="w-80"
              trigger={(p) => (
                <Button variant="accent" size="sm" {...p}>
                  <ShoppingCart aria-hidden className="size-4" /> Tambah produk
                </Button>
              )}
            >
              {(close) => (
                <div className="max-h-80 overflow-y-auto">
                  {[{ label: 'Layanan standar', items: QUOTE_PRODUCTS }, { label: 'Dari tarif lane', items: rateItems }].map((g) => (
                    <div key={g.label}>
                      <p className="px-2 pt-2 pb-1 eyebrow">{g.label}</p>
                      {g.items.map((p) => (
                        <button
                          key={p.item}
                          type="button"
                          onClick={() => {
                            add({ item: p.item, unit: p.unit, qty: 1, price: p.price })
                            close()
                          }}
                          className="flex w-full cursor-pointer items-baseline gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-raised"
                        >
                          <span className="min-w-0 flex-1">{p.item}</span>
                          <span className="shrink-0 text-xs text-muted tabular">
                            {money(p.price)}/{p.unit}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Popover>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className={cn('mt-4 rounded-panel border border-dashed p-6 text-center text-sm text-muted', missing.includes('minimal satu produk') ? 'border-danger' : 'border-line-strong')}>
            Belum ada produk. Pakai Tambah produk, atau tarik dari inquiry.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            <li aria-hidden className="hidden grid-cols-[minmax(0,1fr)_5rem_6rem_9rem_9rem_2.5rem] gap-3 pb-2 text-[11px] font-semibold tracking-wide text-muted uppercase md:grid">
              <span>Item</span>
              <span>Qty</span>
              <span>Satuan</span>
              <span className="text-right">Harga</span>
              <span className="text-right">Jumlah</span>
              <span />
            </li>
            {lines.map((l, i) => (
              <li key={l.key} className="grid grid-cols-2 gap-3 py-3 md:grid-cols-[minmax(0,1fr)_5rem_6rem_9rem_9rem_2.5rem] md:items-center">
                <input aria-label={`Item baris ${i + 1}`} value={l.item} onChange={(e) => edit(l.key, { item: e.target.value })} placeholder="Nama produk atau layanan" className={cn(lineInput, 'col-span-2 md:col-span-1')} />
                <input aria-label={`Qty baris ${i + 1}`} type="number" min={1} value={l.qty} onChange={(e) => edit(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} className={cn(lineInput, 'tabular')} />
                <select aria-label={`Satuan baris ${i + 1}`} value={l.unit} onChange={(e) => edit(l.key, { unit: e.target.value })} className={cn(lineInput, 'cursor-pointer')}>
                  {QUOTE_UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
                <input aria-label={`Harga baris ${i + 1}`} type="number" min={0} step={50_000} value={l.price} onChange={(e) => edit(l.key, { price: Math.max(0, Number(e.target.value) || 0) })} className={cn(lineInput, 'tabular md:text-right')} />
                <span className="self-center text-sm font-semibold tabular md:text-right">{money(l.qty * l.price)}</span>
                <button type="button" aria-label={`Hapus baris ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-9 cursor-pointer place-items-center justify-self-end rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block rounded-card border border-line bg-card p-5 shadow-card">
          <span className="eyebrow">Catatan khusus orderan</span>
          <textarea value={head.notes} onChange={(e) => set('notes', e.target.value)} rows={5} placeholder="Catatan khusus untuk orderan ini…" className="mt-3 w-full resize-y rounded-panel border border-line-strong bg-raised p-3 text-base outline-none focus:border-accent md:text-sm" />
        </label>
        <section aria-label="Ringkasan harga" className="space-y-3 rounded-card border border-line bg-card p-5 shadow-card">
          <p className="flex justify-between text-sm font-semibold tracking-wide uppercase">
            Subtotal <span className="tabular">{money(subtotal)}</span>
          </p>
          <label className="flex items-center gap-3 rounded-panel bg-warning-soft px-4 py-2.5 text-sm font-semibold text-warning">
            <span className="flex-1">Diskon</span>
            <span aria-hidden>- Rp</span>
            <input type="number" min={0} max={subtotal} step={100_000} value={discount} onChange={(e) => setDiscount(Math.min(subtotal, Math.max(0, Number(e.target.value) || 0)))} aria-label="Diskon dalam rupiah" className="w-32 bg-transparent text-right tabular outline-none" />
          </label>
          <div className="flex items-center gap-3 rounded-panel bg-info-soft px-4 py-2.5 text-sm font-semibold text-info-text">
            <Switch checked={ppn} onChange={setPpn} label={`PPN ${PPN}%`} />
            <span className="flex-1">PPN {PPN}%</span>
            <span className="tabular">{money(tax)}</span>
          </div>
          <p className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold uppercase">Total</span>
            <span className="text-2xl font-semibold tracking-tight tabular">{money(total)}</span>
          </p>
        </section>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pb-4">
        <Button variant="ghost" onClick={() => navigate(recordPath(QUOTE))}>
          Batal
        </Button>
        <Button variant="accent" loading={busy} onClick={save}>
          Simpan penawaran
        </Button>
      </div>
    </div>
  )
}
