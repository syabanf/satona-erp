import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { BarChart3, CheckCheck, ChevronRight, Database, FileText, Folder, FolderOpen, LayoutDashboard, Plus, Settings2, Star, type LucideIcon } from 'lucide-react'
import { folderPath, type MenuKind, type MenuNode } from '@/domain/menu'
import { cn } from '@/lib/cn'

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

/** A per-viewer set of ids in localStorage; storage may be blocked, so every access is guarded. */
function useStoredSet(key: string, initial: readonly string[]) {
  const [set, setSet] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      // Blocked storage: start from the defaults.
    }
    return new Set(initial)
  })
  const update = useCallback(
    (fn: (s: Set<string>) => void) =>
      setSet((prev) => {
      const next = new Set(prev)
      fn(next)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        // Blocked storage: the change lasts for this page only.
      }
        return next
      }),
    [key],
  )
  return [set, update] as const
}

interface MenuTreeProps {
  tree: readonly MenuNode[]
  /** Folder and leaf ids from the root to the current page. */
  active: readonly MenuNode[]
  counts: Record<string, number>
  onNavigate?: () => void
}

/** SAP Easy Access style tree: folders open in place, leaves show their T-code, a star pins a leaf to Favourites. */
export function MenuTree({ tree, active, counts, onNavigate }: MenuTreeProps) {
  const [open, setOpen] = useStoredSet('satona-menu-open', ['cockpit'])
  const [favs, setFavs] = useStoredSet('satona-menu-favs', ['approvals'])
  const navigate = useNavigate()
  const activeLeaf = active.at(-1)?.id
  const activeKey = active.map((n) => n.id).join('>')

  // Opening a page from anywhere (a T-code, a link) unfolds its folders.
  useEffect(() => {
    const folders = activeKey.split('>').slice(0, -1).filter(Boolean)
    if (folders.length) setOpen((s) => folders.forEach((id) => s.add(id)))
  }, [activeKey, setOpen])

  const leaves: MenuNode[] = []
  const collect = (nodes: readonly MenuNode[]) => nodes.forEach((n) => (n.to ? leaves.push(n) : n.children && collect(n.children)))
  collect(tree)
  const favourites = leaves.filter((n) => favs.has(n.id))

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-tree-item]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const el = items[i]!
    const id = el.dataset.treeItem ?? ''
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
    } else if (e.key === 'ArrowRight' && el.dataset.folder) {
      e.preventDefault()
      setOpen((s) => s.add(id))
    } else if (e.key === 'ArrowLeft' && el.dataset.folder) {
      e.preventDefault()
      setOpen((s) => s.delete(id))
    }
  }

  const row = (n: MenuNode, depth: number, keyPrefix = '') => {
    const pad = { paddingLeft: `${8 + depth * 14}px` }
    if (!n.to) {
      const isOpen = open.has(n.id)
      const onPath = active.some((a) => a.id === n.id)
      const here = n.id === activeLeaf
      const Icon = isOpen ? FolderOpen : Folder
      // A folder opens its card page and unfolds; clicking the folder whose page is showing folds it again.
      const onClick = () => {
        if (here) return setOpen((s) => (s.has(n.id) ? s.delete(n.id) : s.add(n.id)))
        setOpen((s) => s.add(n.id))
        navigate(folderPath(n.id))
      }
      return (
        <li key={keyPrefix + n.id} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
          <button
            type="button"
            data-tree-item={n.id}
            data-folder="1"
            onClick={onClick}
            aria-current={here ? 'page' : undefined}
            style={pad}
            className={cn(
              'relative flex h-9 w-full cursor-pointer items-center gap-2 rounded-xl pr-2 text-left text-sm transition-colors',
              here ? 'bg-accent-soft font-semibold text-accent-text' : 'hover:bg-raised',
              !here && (onPath ? 'font-semibold text-fg' : depth === 0 ? 'font-medium text-fg' : 'text-body'),
            )}
          >
            {here && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-accent" />}
            <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-subtle transition-transform', isOpen && 'rotate-90')} />
            <Icon aria-hidden className={cn('size-4 shrink-0', onPath ? 'text-accent-text' : 'text-muted')} />
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
          </button>
          {isOpen && n.children && (
            <ul role="group" className="animate-fade">
              {n.children.map((c) => row(c, depth + 1, keyPrefix))}
            </ul>
          )}
        </li>
      )
    }
    const Icon = MENU_ICON[n.kind]
    const on = n.id === activeLeaf
    const count = n.approval ? (counts[`${n.approval.type}:${n.approval.status}`] ?? 0) : n.id === 'approvals' ? Object.values(counts).reduce((s, c) => s + c, 0) : 0
    const fav = favs.has(n.id)
    return (
      <li key={keyPrefix + n.id} role="treeitem" aria-selected={on} className="group/leaf relative">
        <Link
          to={n.to}
          data-tree-item={n.id}
          onClick={onNavigate}
          aria-current={on ? 'page' : undefined}
          style={pad}
          className={cn(
            'relative flex h-9 items-center gap-2 rounded-xl pr-8 text-sm transition-colors',
            on ? 'bg-accent-soft font-medium text-accent-text' : 'text-body hover:bg-raised hover:text-fg',
          )}
        >
          {on && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-accent" />}
          <span className="w-3.5 shrink-0" />
          <Icon aria-hidden className={cn('size-4 shrink-0', on ? 'text-accent-text' : 'text-subtle')} />
          <span className="min-w-0 flex-1 truncate">{n.label}</span>
          {count > 0 && (
            <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-semibold text-white tabular">
              {count}
              <span className="sr-only"> waiting</span>
            </span>
          )}
          {n.tcode && <span className={cn('shrink-0 font-mono text-[11px]', on ? 'text-accent-text' : 'text-subtle')}>{n.tcode}</span>}
        </Link>
        <button
          type="button"
          aria-label={fav ? `Remove ${n.label} from favourites` : `Add ${n.label} to favourites`}
          aria-pressed={fav}
          onClick={() => setFavs((s) => (s.has(n.id) ? s.delete(n.id) : s.add(n.id)))}
          className={cn(
            'absolute top-1/2 right-1 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md transition-opacity hover:bg-control focus-visible:opacity-100',
            fav ? 'text-warning opacity-100' : 'text-subtle opacity-0 group-hover/leaf:opacity-100',
          )}
        >
          <Star aria-hidden className={cn('size-3.5', fav && 'fill-current')} />
        </button>
      </li>
    )
  }

  return (
    <div onKeyDown={onKeyDown}>
      {favourites.length > 0 && (
        <div className="mb-3">
          <p className="px-2 pb-1 eyebrow">Favourites</p>
          <ul role="tree" aria-label="Favourites">
            {favourites.map((n) => row(n, 0, 'fav:'))}
          </ul>
        </div>
      )}
      <p className="px-2 pb-1 eyebrow">Menu</p>
      <ul role="tree" aria-label="Menu">
        {tree.map((n) => row(n, 0))}
      </ul>
    </div>
  )
}
