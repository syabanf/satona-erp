import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BarChart3, CheckCheck, ChevronDown, Database, FileText, Folder, LayoutDashboard, Plus, Search, Settings2, Star, X, type LucideIcon } from 'lucide-react'
import { folderPath, walk, type MenuKind, type MenuNode } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { useRecordDrawer } from '../../records/drawer'

export const MENU_ICON: Record<MenuKind, LucideIcon> = {
  folder: Folder,
  create: Plus,
  master: Database,
  transaction: FileText,
  approval: CheckCheck,
  report: BarChart3,
  config: Settings2,
  page: LayoutDashboard,
}

/** A per-viewer value in localStorage; storage may be blocked, so every access is guarded. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) return JSON.parse(saved) as T
    } catch {
      // Blocked storage: start from the default.
    }
    return initial
  })
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Blocked storage: the change lasts for this page only.
      }
    },
    [key],
  )
  return [value, update] as const
}

interface Props {
  tree: readonly MenuNode[]
  /** Nodes from the root to the current page. */
  active: readonly MenuNode[]
  counts: Record<string, number>
  onNavigate?: () => void
}

const isFeature = (n: MenuNode) => n.id.endsWith(':folder')
const waitingIn = (n: MenuNode, counts: Record<string, number>) => [...walk([n])].reduce((s, x) => s + (x.approval ? (counts[`${x.approval.type}:${x.approval.status}`] ?? 0) : 0), 0)
const shortLabel = (n: MenuNode) => n.label.split(' · ').at(-1) ?? n.label

/** A small count pill for approvals waiting. */
function Waiting({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-semibold text-white tabular">
      {n}
      <span className="sr-only"> menunggu</span>
    </span>
  )
}

/**
 * The full menu without the deep folder walk: pick a company, open one module at a time, and its features sit in a
 * flat list with a quick + and their approval count. Typing searches every feature, screen and T-code at once.
 */
export function MenuNavigator({ tree, active, counts, onNavigate }: Props) {
  const openDrawer = useRecordDrawer()
  const [query, setQuery] = useState('')
  const [favs, setFavs] = useStored<string[]>('satona-menu-favs', ['approvals'])
  const onTrail = (id: string) => active.some((a) => a.id === id)
  const entities = tree.filter((n) => n.id.startsWith('entity:'))
  const cockpit = tree.find((n) => n.id === 'cockpit')
  const [pickedEntity, setEntity] = useStored('satona-menu-entity', entities[0]?.id ?? 'cockpit')
  // A chip the user just picked wins over the company of the page they are on.
  const [chosen, setChosen] = useState<string | null>(null)
  const entityId = chosen ?? active.find((a) => a.id.startsWith('entity:'))?.id ?? pickedEntity
  const entity = tree.find((n) => n.id === entityId) ?? (entityId === 'cockpit' ? cockpit : entities[0])
  const modules = (entity?.children ?? []).filter((c) => c.children)
  const [openModule, setOpenModule] = useState<string | null>(() => modules.find((m) => onTrail(m.id))?.id ?? null)
  const shownModule = openModule ?? modules.find((m) => onTrail(m.id))?.id

  // Every feature and screen with the trail of names above it, for search and favourites.
  const index = useMemo(() => {
    const out: Array<{ node: MenuNode; context: string }> = []
    const visit = (nodes: readonly MenuNode[], trail: string[]) => {
      for (const n of nodes) {
        if (n.to || isFeature(n)) out.push({ node: n, context: trail.slice(-2).join(' · ') })
        // A feature's own screens (create, list, approvals) are indexed too, so T-codes like PTW01 find them.
        if (n.children) visit(n.children, [...trail, shortLabel(n)])
      }
    }
    visit(tree, [])
    return out
  }, [tree])

  const words = query.trim().toLowerCase().replace(/^\/[no]/, '').split(/\s+/).filter(Boolean)
  const results = words.length ? index.filter(({ node, context }) => words.every((w) => `${node.label} ${node.tcode ?? ''} ${context}`.toLowerCase().includes(w))).slice(0, 30) : []
  const favourites = favs.flatMap((id) => index.find((x) => x.node.id === id) ?? [])
  const toggleFav = (id: string) => setFavs(favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id])
  const hrefOf = (n: MenuNode) => n.to ?? folderPath(n.id)

  const row = (n: MenuNode, context?: string) => {
    const feature = isFeature(n)
    const create = feature ? n.children?.find((c) => c.kind === 'create') : undefined
    const typeKey = n.id.replace(/:folder$/, '')
    const here = onTrail(n.id) || (n.to !== undefined && active.at(-1)?.id === n.id)
    const Icon = feature ? (n.children?.some((c) => c.kind === 'master') ? Database : FileText) : MENU_ICON[n.kind]
    const fav = favs.includes(n.id)
    return (
      <li key={n.id} className="group/row relative">
        <Link
          to={hrefOf(n)}
          onClick={onNavigate}
          aria-current={here ? 'page' : undefined}
          className={cn('flex min-h-9 items-center gap-2.5 rounded-xl py-1.5 pr-16 pl-2.5 text-sm transition-colors', here ? 'bg-accent-soft font-medium text-accent-text' : 'text-body hover:bg-raised hover:text-fg')}
        >
          <Icon aria-hidden className={cn('size-4 shrink-0', here ? 'text-accent-text' : 'text-subtle')} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{shortLabel(n)}</span>
            {context && <span className="block truncate text-[11px] text-subtle">{context}</span>}
          </span>
          <Waiting n={waitingIn(n, counts)} />
        </Link>
        <span className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
          {create && (
            <button
              type="button"
              aria-label={`Buat ${shortLabel(n).toLowerCase()} baru`}
              title={create.tcode}
              onClick={() => {
                onNavigate?.()
                openDrawer({ mode: 'create', type: typeKey })
              }}
              className="grid size-7 cursor-pointer place-items-center rounded-lg text-subtle opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-control hover:text-accent-text focus-visible:opacity-100"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label={fav ? `Hapus ${shortLabel(n)} dari favorit` : `Tambah ${shortLabel(n)} ke favorit`}
            aria-pressed={fav}
            onClick={() => toggleFav(n.id)}
            className={cn('grid size-7 cursor-pointer place-items-center rounded-lg transition-opacity hover:bg-control focus-visible:opacity-100', fav ? 'text-warning' : 'text-subtle opacity-0 group-hover/row:opacity-100')}
          >
            <Star aria-hidden className={cn('size-3.5', fav && 'fill-current')} />
          </button>
        </span>
      </li>
    )
  }

  return (
    <div className="space-y-3">
      <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-raised px-2.5 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <Search aria-hidden className="size-4 shrink-0 text-subtle" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari menu atau kode" aria-label="Cari di menu" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle" />
        {query && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')} className="grid size-6 cursor-pointer place-items-center rounded-md text-subtle hover:bg-control">
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </label>

      {words.length > 0 ? (
        <ul aria-label="Hasil pencarian menu" className="space-y-0.5">
          {results.map(({ node, context }) => row(node, context))}
          {results.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">Tidak ada menu yang cocok.</li>}
        </ul>
      ) : (
        <>
          {favourites.length > 0 && (
            <section>
              <p className="px-2.5 pb-1 eyebrow">Favorit</p>
              <ul className="space-y-0.5">{favourites.map(({ node }) => row(node))}</ul>
            </section>
          )}

          <div role="tablist" aria-label="Perusahaan" className="flex flex-wrap gap-1.5">
            {[...(cockpit ? [{ id: 'cockpit', label: 'Grup' }] : []), ...entities.map((e) => ({ id: e.id, label: shortLabel(e) }))].map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={entity?.id === e.id}
                onClick={() => {
                  setEntity(e.id)
                  setChosen(e.id)
                  setOpenModule(null)
                }}
                className={cn('h-8 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors', entity?.id === e.id ? 'bg-invert text-on-invert' : 'bg-raised text-body hover:bg-control')}
              >
                {e.label}
              </button>
            ))}
          </div>

          {entity?.id === 'cockpit' ? (
            <ul className="space-y-0.5">{(cockpit?.children ?? []).map((n) => row(n))}</ul>
          ) : (
            <ul className="space-y-1">
              {(entity?.children ?? [])
                .filter((c) => c.to)
                .map((n) => row(n))}
              {modules.map((m) => {
                const open = shownModule === m.id
                const folders = m.children ?? []
                const section = (suffix: string, title: string) => {
                  const items = folders.find((f) => f.id === `${m.id}:${suffix}`)?.children ?? []
                  return items.length ? (
                    <div key={suffix}>
                      <p className="px-2.5 pt-2 pb-0.5 text-[11px] font-medium text-subtle">{title}</p>
                      <ul className="space-y-0.5">{items.map((n) => row(n))}</ul>
                    </div>
                  ) : null
                }
                const extras = folders.filter((f) => f.id.endsWith(':reports') || f.id.endsWith(':config')).flatMap((f) => f.children ?? [])
                return (
                  <li key={m.id} className={cn('rounded-2xl transition-colors', open && 'bg-raised/70 pb-2')}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenModule(open ? '' : m.id)}
                      className={cn('flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-2xl px-2.5 text-left text-sm transition-colors hover:bg-raised', onTrail(m.id) ? 'font-semibold text-fg' : 'font-medium text-body')}
                    >
                      <span className={cn('grid h-6 min-w-9 place-items-center rounded-lg px-1 font-mono text-[10px] font-semibold', onTrail(m.id) ? 'bg-accent text-white' : 'bg-control text-muted')}>{m.id.toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate">{shortLabel(m)}</span>
                      <Waiting n={waitingIn(m, counts)} />
                      <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="animate-fade px-1">
                        <Link to={folderPath(m.id)} onClick={onNavigate} className="mx-1.5 mt-1 mb-1 block rounded-lg px-2 py-1 text-xs font-medium text-accent-text hover:bg-control">
                          Lihat ringkasan modul
                        </Link>
                        {section('transactions', 'Transaksi')}
                        {section('master', 'Data utama')}
                        {extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 px-1.5 pt-2">
                            {extras.map((x) => (
                              <Link key={x.id} to={x.to ?? '/'} onClick={onNavigate} title={x.tcode} className="inline-flex h-7 items-center gap-1 rounded-full bg-card px-2.5 text-[11px] text-body shadow-card hover:text-fg">
                                {x.kind === 'config' ? <Settings2 aria-hidden className="size-3" /> : <BarChart3 aria-hidden className="size-3" />}
                                <span className="max-w-36 truncate">{x.label}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
