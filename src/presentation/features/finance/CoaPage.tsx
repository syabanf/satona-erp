import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, FolderTree, Plus } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { trialBalance } from '@/domain/ledger'
import { canCreate, type ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { money, moneyCompact } from '@/lib/format'
import { useAccess, useAllRecords } from '../../hooks/useRecords'
import { useRecordDrawer } from '../../records/drawer'
import { RecordControls } from '../../records/RecordControls'
import { ENTITY_NAME } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'

const CLASS_ID: Record<string, string> = { Asset: 'Aset', Liability: 'Liabilitas', Equity: 'Ekuitas', Revenue: 'Pendapatan', Expense: 'Beban' }

/**
 * The chart of accounts as a tree: headers fold, every account shows its posted balance (a header sums its children),
 * a leaf opens its general ledger, and accounts are added, edited and deactivated in place.
 */
export default function CoaPage() {
  const all = useAllRecords()
  const open = useRecordDrawer()
  const type = typeOf('mdm.accounts')!
  const creatable = canCreate(type, useAccess()(type.module))
  const [entity, setEntity] = useState('')
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())

  const tree = useMemo(() => {
    if (!all.data) return null
    const accounts = [...(all.data['mdm.accounts'] ?? [])].sort((a, b) => String(a.values.code).localeCompare(String(b.values.code)))
    const own = new Map(trialBalance(all.data, { entity: entity || undefined }).rows.map((r) => [r.account.id, r.balance]))
    const kids = new Map<string, ErpRecord[]>()
    for (const a of accounts) kids.set(String(a.values.parent ?? ''), [...(kids.get(String(a.values.parent ?? '')) ?? []), a])
    // A header's balance is the sum of everything under it.
    const total = (a: ErpRecord): number => (own.get(a.id) ?? 0) + (kids.get(a.id) ?? []).reduce((s, c) => s + total(c), 0)
    return { roots: kids.get('') ?? [], kids, total, count: accounts.length }
  }, [all.data, entity])

  if (!tree) return <CardSkeleton lines={10} />
  const toggle = (id: string) => setFolded((f) => new Set(f.has(id) ? [...f].filter((x) => x !== id) : [...f, id]))
  const classTotal = (cls: string) => tree.roots.filter((r) => r.values.class === cls).reduce((s, r) => s + tree.total(r), 0)

  const row = (a: ErpRecord, depth: number): React.ReactNode => {
    const children = tree.kids.get(a.id) ?? []
    const header = a.values.postable === 'No'
    const shut = folded.has(a.id)
    return (
      <li key={a.id}>
        <div className={cn('group flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-2 pr-1 text-sm', header && 'font-semibold', a.status !== 'active' && 'opacity-50')} style={{ paddingLeft: depth * 14 }}>
          {children.length > 0 ? (
            <button type="button" aria-expanded={!shut} aria-label={`${shut ? 'Buka' : 'Tutup'} ${String(a.values.name)}`} onClick={() => toggle(a.id)} className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-raised">
              <ChevronRight aria-hidden className={cn('size-4 transition-transform', !shut && 'rotate-90')} />
            </button>
          ) : (
            <span className="size-6 shrink-0" />
          )}
          <span className="w-12 shrink-0 font-mono text-xs text-muted">{String(a.values.code)}</span>
          {header ? (
            <span className="min-w-0 flex-1 basis-24 truncate">{String(a.values.name)}</span>
          ) : (
            <Link to={`/finance/reports?tab=gl&account=${a.id}${entity ? `&entity=${entity}` : ''}`} className="min-w-0 flex-1 basis-24 truncate hover:text-accent-text hover:underline">
              {String(a.values.name)}
            </Link>
          )}
          <span className="hidden w-40 shrink-0 truncate text-xs font-normal text-muted md:block">{String(a.values.kind)}</span>
          <span className="shrink-0 text-right tabular md:w-36">{money(tree.total(a))}</span>
          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:w-full max-md:justify-end max-md:opacity-100">
            {creatable && (
              <Button size="icon-sm" variant="soft" aria-label={`Tambah akun di bawah ${String(a.values.name)}`} onClick={() => open({ mode: 'create', type: type.key, prefill: { parent: a.id, class: a.values.class, kind: a.values.kind, postable: 'Yes' } })}>
                <Plus aria-hidden className="size-4" />
              </Button>
            )}
            <RecordControls type={type} record={a} steps={false} />
          </span>
        </div>
        {children.length > 0 && !shut && <ul>{children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Object.entries(CLASS_ID).map(([cls, label]) => (
          <div key={cls} className="rounded-card border border-line bg-card p-4 shadow-card">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular">{moneyCompact(classTotal(cls))}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Bagan akun"
          icon={<FolderTree aria-hidden className="size-5 text-muted" />}
          action={
            <span className="flex flex-wrap items-center gap-2">
              <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Unit" className="h-9 cursor-pointer rounded-full border border-line-strong bg-card px-3 text-sm">
                <option value="">Saldo semua unit</option>
                {Object.entries(ENTITY_NAME).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              {creatable && (
                <Button size="sm" variant="accent" onClick={() => open({ mode: 'create', type: type.key, prefill: { postable: 'Yes' } })}>
                  <Plus aria-hidden className="size-4" /> Akun baru
                </Button>
              )}
            </span>
          }
        />
        <p className="mb-2 text-xs text-muted">{tree.count} akun. Akun induk menjumlahkan akun di bawahnya; klik akun untuk membuka buku besarnya. Saldo dari jurnal yang sudah diposting.</p>
        <ul>{tree.roots.map((r) => row(r, 0))}</ul>
      </Card>
    </div>
  )
}
