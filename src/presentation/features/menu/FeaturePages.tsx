import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, Boxes, CheckCheck, Database, FileText, Plus, Settings2 } from 'lucide-react'
import { RECORD_TYPES, typeOf } from '@/domain/catalog'
import type { Entity, ErpModule } from '@/domain/erp'
import { dateFieldOf } from '@/domain/calendar'
import { approvalStates, featureStats, relatedTypes, type FeatureStats } from '@/domain/featureStats'
import { mappable } from '@/domain/geo'
import { chainTo, folderPath, walk, type MenuNode } from '@/domain/menu'
import { moduleLabel, recordLabel } from '@/domain/uiLabels'
import { canCreate, type ErpRecord, type RecordType, type StateTone } from '@/domain/records'
import { cn } from '@/lib/cn'
import { count } from '@/lib/format'
import { useAccess } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useRecordDrawer } from '../../records/drawer'
import { RecordCalendar } from '../../records/RecordCalendar'
import { StateBadge } from '../../records/StateBadge'
import { fieldText, recordPath, recordTitle, type AllRecords } from '../../records/text'
import { Tag } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { Skeleton } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'

const RecordMap = lazy(() => import('../../records/RecordMap').then((m) => ({ default: m.RecordMap })))

const BAR: Record<StateTone, string> = { neutral: 'bg-line-strong', info: 'bg-info', warning: 'bg-warning', success: 'bg-success', danger: 'bg-danger', accent: 'bg-accent' }
const int = (v: number) => count(Math.round(v))
const AREA_LABEL = { master: 'Data utama', transaction: 'Transaksi' } as const
const typeKey = (folderId: string) => folderId.replace(/:folder$/, '')
/** Feature names in sentence case; some Indonesian labels are stored lower case for use mid-sentence. */
const featureName = (t: RecordType) => recordLabel(t.key, t.name).replace(/^\p{Ll}/u, (c) => c.toUpperCase())

/** Record types filed under a menu node, in menu order. */
export const typesUnder = (node: MenuNode) => [...walk(node.children ?? [])].filter((n) => n.id.endsWith(':folder')).flatMap((n) => typeOf(typeKey(n.id)) ?? [])

function useStats() {
  const { clock } = useServices()
  const today = clock.today()
  return (type: RecordType, all: AllRecords) => featureStats(type, all[type.key] ?? [], today)
}

/** Status split as one bar; each segment opens the list on that status. */
function StatusBar({ type, stats }: { type: RecordType; stats: FeatureStats }) {
  if (!stats.total) return <div className="h-2 rounded-full bg-control" />
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-control" role="img" aria-label={stats.byStatus.map((s) => `${s.label} ${s.count}`).join(', ')}>
      {stats.byStatus
        .filter((s) => s.count)
        .map((s) => (
          <Link key={s.id} to={`${recordPath(type)}?status=${s.id}`} title={`${s.label}: ${s.count}`} className={cn('h-full transition-opacity hover:opacity-70', BAR[s.tone])} style={{ width: `${(s.count / stats.total) * 100}%` }} />
        ))}
    </div>
  )
}

/** One feature with its numbers and its next actions; the title opens the feature page. */
export function TypeCard({ type, stats }: { type: RecordType; stats: FeatureStats }) {
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const gate = [...approvalStates(type)][0]
  const Icon = type.area === 'master' ? Database : FileText
  return (
    <div data-motion="rise" className="flex h-full flex-col rounded-card border border-line bg-card p-5 shadow-card">
      <Link to={folderPath(`${type.key}:folder`)} className="group flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised">
          <Icon aria-hidden className="size-5 text-muted" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg group-hover:underline">{featureName(type)}</span>
          <span className="block font-mono text-[11px] text-subtle">
            {type.prefix}01 · {type.prefix}02
          </span>
        </span>
        <span className="text-2xl font-medium tracking-tight tabular">{int(stats.total)}</span>
      </Link>
      <div className="mt-4">
        <StatusBar type={type} stats={stats} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>{int(stats.open)} berjalan</span>
        {stats.waiting > 0 && gate && (
          <Link to={`${recordPath(type)}?status=${gate}`} className="font-semibold text-accent-text hover:underline">
            {int(stats.waiting)} menunggu persetujuan
          </Link>
        )}
        <span>{int(stats.recent)} baru 30 hari</span>
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {canCreate(type, accessFor(type.module)) && (
          <Button size="sm" variant="soft" onClick={() => open({ mode: 'create', type: type.key })}>
            <Plus aria-hidden className="size-3.5" /> Baru
          </Button>
        )}
        <Link to={recordPath(type)} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          Daftar <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

function TypeGrid({ title, types, all }: { title: string; types: readonly RecordType[]; all: AllRecords }) {
  const stats = useStats()
  if (!types.length) return null
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted">({types.length})</span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {types.map((t) => (
          <TypeCard key={t.key} type={t} stats={stats(t, all)} />
        ))}
      </div>
    </section>
  )
}

/** Totals over a set of features, each tile opening the first feature that holds them. */
function Totals({ types, all, label }: { types: readonly RecordType[]; all: AllRecords; label: string }) {
  const stats = useStats()
  const rows = types.map((t) => ({ t, s: stats(t, all) }))
  const sum = (k: 'total' | 'open' | 'waiting' | 'recent') => rows.reduce((n, r) => n + r.s[k], 0)
  const first = (k: 'open' | 'waiting' | 'recent') => [...rows].sort((a, b) => b.s[k] - a.s[k])[0]
  const to = (k: 'open' | 'waiting' | 'recent') => {
    const top = first(k)
    if (!top) return '/'
    if (k === 'waiting') return `${recordPath(top.t)}?status=${[...approvalStates(top.t)][0] ?? ''}`
    return recordPath(top.t)
  }
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <KpiTile label={`Data ${label}`} value={sum('total')} format={int} to={to('open')} accent note={`${types.length} fitur`} />
      <KpiTile label="Masih berjalan" value={sum('open')} format={int} to={to('open')} note="belum mencapai status akhir" />
      <KpiTile label="Menunggu persetujuan" value={sum('waiting')} format={int} to={to('waiting')} note="di matriks persetujuan" />
      <KpiTile label="Baru 30 hari" value={sum('recent')} format={int} to={to('recent')} note="dibuat bulan ini" />
    </div>
  )
}

/** Report and configuration leaves of a module as compact links. */
function LeafLinks({ node }: { node: MenuNode }) {
  const leaves = (node.children ?? []).filter((c) => c.id.endsWith(':reports') || c.id.endsWith(':config')).flatMap((c) => c.children ?? [])
  if (!leaves.length) return null
  return (
    <Card>
      <CardHeader title="Laporan dan konfigurasi" />
      <div className="flex flex-wrap gap-2">
        {leaves.map((l) => (
          <Link key={l.id} to={l.to ?? '/'} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-raised px-3 text-sm hover:bg-control">
            {l.kind === 'config' ? <Settings2 aria-hidden className="size-4 text-muted" /> : <Boxes aria-hidden className="size-4 text-muted" />}
            {l.label}
            {l.tcode && <span className="font-mono text-[11px] text-accent-text">{l.tcode}</span>}
          </Link>
        ))}
      </div>
    </Card>
  )
}

/** A module, or its master data or transactions folder: module facts, totals, then one card per feature. */
export function ModuleFolder({ node, module, all }: { node: MenuNode; module: ErpModule; all: AllRecords }) {
  const types = typesUnder(node)
  const area = node.id.endsWith(':master') ? 'master' : node.id.endsWith(':transactions') ? 'transaction' : undefined
  return (
    <div className="space-y-6">
      {!area && (
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-md bg-raised px-1.5 py-0.5 font-mono font-semibold text-fg">{module.code}</span>
                {module.departments.join(' · ')}
              </p>
              <h2 className="mt-2 text-xl font-semibold">{moduleLabel(module.id, module.name)}</h2>
              <p className="text-sm text-muted">{module.name}</p>
              <p className="mt-1 text-sm text-muted">Dipakai oleh {module.users.join(', ')}.</p>
            </div>
            {module.live && (
              <Link to={module.live.to} className={buttonStyles({ variant: 'solid', size: 'sm' })}>
                {module.live.label} <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </div>
          {module.kpis.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {module.kpis.map((k) => (
                <div key={k.label} className="rounded-panel bg-raised p-3">
                  <dt className="text-xs text-muted">{k.label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular">{k.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}
      <Totals types={types} all={all} label={area ? AREA_LABEL[area].toLowerCase() : module.code} />
      {(!area || area === 'transaction') && <TypeGrid title="Transaksi" types={types.filter((t) => t.area === 'transaction')} all={all} />}
      {(!area || area === 'master') && <TypeGrid title="Data utama" types={types.filter((t) => t.area === 'master')} all={all} />}
      {!area && <LeafLinks node={node} />}
      {!area && module.scope.length > 0 && (
        <Card>
          <CardHeader title="Cakupan modul" action={<span className="text-xs text-muted">{module.scope.length} butir</span>} />
          <ul className="grid gap-2 sm:grid-cols-2">
            {module.scope.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm">
                <CheckCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                {s.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/** A company: its totals and one card per module with that module's numbers. */
export function EntityFolder({ node, entity, modules, all }: { node: MenuNode; entity: Entity; modules: readonly ErpModule[]; all: AllRecords }) {
  const stats = useStats()
  const mods = (node.children ?? []).flatMap((c) => {
    const module = modules.find((m) => m.id === c.id)
    return module ? [{ node: c, module, types: typesUnder(c) }] : []
  })
  const home = (node.children ?? []).find((c) => c.to)
  return (
    <div className="space-y-6">
      <Totals types={mods.flatMap((m) => m.types)} all={all} label={entity.short} />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Modul {entity.short}</h2>
          {home?.to && (
            <Link to={home.to} className={buttonStyles({ variant: 'card', size: 'sm' })}>
              {home.label} <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mods.map(({ node: n, module, types }) => {
            const s = types.map((t) => stats(t, all))
            const total = (k: 'total' | 'open' | 'waiting') => s.reduce((acc, x) => acc + x[k], 0)
            return (
              <Link key={module.id} to={folderPath(n.id)} data-motion="rise" className="flex h-full flex-col rounded-card border border-line bg-card p-5 shadow-card transition-[translate] duration-300 [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-xs font-semibold">{module.code}</span>
                  {total('waiting') > 0 && <Tag tone="accent">{int(total('waiting'))} menunggu</Tag>}
                </span>
                <span className="mt-2 font-semibold text-fg">{moduleLabel(module.id, module.name)}</span>
                <span className="mt-1 line-clamp-2 text-xs text-muted">{types.map(featureName).join(' · ')}</span>
                <span className="mt-auto grid grid-cols-3 gap-2 pt-4 text-center">
                  {(
                    [
                      ['Fitur', types.length],
                      ['Data', total('total')],
                      ['Berjalan', total('open')],
                    ] as const
                  ).map(([label, value]) => (
                    <span key={label} className="rounded-panel bg-raised py-2">
                      <span className="block text-lg font-semibold tabular">{int(value)}</span>
                      <span className="block text-[11px] text-muted">{label}</span>
                    </span>
                  ))}
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function RelatedList({ title, note, types, tree, all }: { title: string; note: string; types: readonly RecordType[]; tree: readonly MenuNode[]; all: AllRecords }) {
  if (!types.length) return null
  return (
    <Card>
      <CardHeader title={title} action={<span className="text-xs text-muted">{note}</span>} />
      <ul className="divide-y divide-line">
        {types.map((t) => {
          const inMenu = chainTo(tree, `${t.key}:folder`).length > 0
          return (
            <li key={t.key}>
              <Link to={inMenu ? folderPath(`${t.key}:folder`) : recordPath(t)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                <span className="min-w-0 flex-1 truncate">{featureName(t)}</span>
                <span className="font-mono text-[11px] text-subtle">{t.module.toUpperCase()}</span>
                <span className="w-10 text-right text-xs text-muted tabular">{int((all[t.key] ?? []).length)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** One feature (record type): its numbers, the actions the menu offers for it, status split, latest records and the features around it. */
export function FeatureFolder({ node, type, tree, all }: { node: MenuNode; type: RecordType; tree: readonly MenuNode[]; all: AllRecords }) {
  const stats = useStats()(type, all)
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const related = relatedTypes(type, RECORD_TYPES)
  const gate = [...approvalStates(type)][0]
  const list = recordPath(type)
  const leaves = (node.children ?? []).filter((c) => c.to && c.kind !== 'create')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canCreate(type, accessFor(type.module)) && (
          <Button variant="accent" size="sm" onClick={() => open({ mode: 'create', type: type.key })}>
            <Plus aria-hidden className="size-4" /> {type.singular} baru
            <span className="font-mono text-[10px] opacity-80">{type.prefix}01</span>
          </Button>
        )}
        {leaves.map((l) => (
          <Link key={l.id} to={l.to!} className={buttonStyles({ variant: l.kind === 'approval' ? 'solid' : 'card', size: 'sm' })}>
            {l.label}
            {l.tcode && <span className="font-mono text-[10px] opacity-70">{l.tcode}</span>}
          </Link>
        ))}
        <Tag tone="neutral" className="ml-auto">
          {AREA_LABEL[type.area]} · {type.module.toUpperCase()}
        </Tag>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile label={`Semua ${recordLabel(type.key, type.name).toLowerCase()}`} value={stats.total} format={int} to={list} accent note={`${type.fields.length} kolom per data`} />
        <KpiTile label="Masih berjalan" value={stats.open} format={int} to={list} note="belum mencapai status akhir" />
        <KpiTile label="Menunggu persetujuan" value={stats.waiting} format={int} to={gate ? `${list}?status=${gate}` : list} note={gate ? 'buka antrean persetujuan' : 'tanpa gerbang persetujuan'} />
        <KpiTile label="Baru 30 hari" value={stats.recent} format={int} to={list} note="dibuat bulan ini" />
        {stats.sum && <KpiTile label={`Total ${stats.sum.field.label.toLowerCase()}`} value={stats.sum.value} format={(v) => fieldText(stats.sum!.field, Math.round(v), all)} to={list} note="dari semua data" />}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Data terbaru" action={<Link to={list} className="text-xs font-medium text-accent-text hover:underline">Lihat semua</Link>} />
          {stats.latest.length === 0 ? (
            <p className="text-sm text-muted">Belum ada data. Buat yang pertama dengan tombol di atas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.latest.map((r: ErpRecord) => (
                <li key={r.id} data-motion="row">
                  <button type="button" onClick={() => open({ mode: 'view', type: type.key, id: r.id })} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left text-sm hover:bg-raised">
                    <span className="font-mono text-xs text-muted">{r.id}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{recordTitle(type, r, all)}</span>
                    <span className="hidden text-xs text-muted sm:inline">{r.createdAt.slice(0, 10)}</span>
                    <StateBadge type={type} status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Alur status" />
          <ol className="space-y-2.5">
            {stats.byStatus.map((s) => (
              <li key={s.id}>
                <Link to={`${list}?status=${s.id}`} className="block hover:opacity-80">
                  <span className="flex justify-between text-sm">
                    <span>{s.label}</span>
                    <span className="text-muted tabular">{int(s.count)}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-control">
                    <span className={cn('block h-full rounded-full', BAR[s.tone])} style={{ width: `${stats.total ? (s.count / stats.total) * 100 : 0}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">{type.workflow.transitions.map((t) => t.label).filter((l, i, a) => a.indexOf(l) === i).join(' · ')}</p>
        </Card>
      </div>

      {mappable(type, all, typeOf) && (
        <Card>
          <CardHeader title="Peta" action={<span className="text-xs text-muted">pilih titik atau rute untuk melihat datanya</span>} />
          <Suspense fallback={<Skeleton className="h-[420px] rounded-panel" />}>
            <RecordMap type={type} rows={all[type.key] ?? []} all={all} />
          </Suspense>
        </Card>
      )}
      {dateFieldOf(type) && (
        <Card>
          <CardHeader title="Kalender" action={<Link to={`${list}?view=calendar`} className="text-xs font-medium text-accent-text hover:underline">Buka dengan filter</Link>} />
          <RecordCalendar type={type} rows={all[type.key] ?? []} all={all} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RelatedList title="Sub-fitur terkait" note="memakai data ini" types={related.usedBy} tree={tree} all={all} />
        <RelatedList title="Data utama yang dipakai" note="dipilih saat mengisi" types={related.uses} tree={tree} all={all} />
      </div>
    </div>
  )
}
