import { Link } from 'react-router'
import { Building2, Check, ChevronsLeft, ChevronsRight, ChevronsUpDown, FlaskConical, Folder, LayoutDashboard, Moon, RotateCcw, Sprout, Truck, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import { menuItem, Popover } from '../../ui/Popover'
import { POP } from '../../ui/pop'
import { Switch } from '../../ui/Switch'
import { ThemeToggle } from '../../ui/ThemeToggle'
import { useToast } from '../../ui/useToast'
import { useMenu, useTrail } from '../../hooks/useMenu'
import { useServices } from '../../hooks/useServices'
import { CommandField } from './CommandField'
import { MenuTree } from './MenuTree'
import { RoleSwitcher } from './RoleSwitcher'

interface SidebarProps {
  /** Icon-only column. The drawer on phones is never collapsed. */
  collapsed: boolean
  /** Called after any navigation, so the phone drawer can close. */
  onNavigate?: () => void
  onClose?: () => void
  /** Collapsed rail: a top-level icon asks the shell to open the sidebar. */
  onExpand?: () => void
}

const TOP_ICON: Record<string, LucideIcon> = {
  cockpit: LayoutDashboard,
  'entity:holding': Building2,
  'entity:rotama': Truck,
  'entity:rodame': Sprout,
  'entity:roasi': FlaskConical,
}

const ENTITY_LINKS = [
  { to: '/entities/holding', label: 'Satona Holding' },
  { to: '/entities/rotama', label: 'Rotama · Logistics' },
  { to: '/entities/rodame', label: 'Rodame · Fertiliser' },
  { to: '/entities/roasi', label: 'Roasi · Chemicals' },
]

function WorkspaceSwitcher({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const tile = <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold', POP.red)}>S</span>
  return (
    <Popover
      align="left"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label="Switch entity"
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-2xl text-left transition-colors hover:bg-control',
            collapsed ? 'justify-center p-1.5' : 'border border-line bg-raised p-2',
          )}
        >
          {tile}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">Satona Group</span>
                <span className="block truncate text-xs text-muted">ERP command centre</span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 text-muted" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="px-3 pt-1 pb-2 eyebrow">Jump to entity</p>
          <Link to="/" onClick={() => { close(); onNavigate?.() }} className={menuItem}>
            <span className="flex-1">Whole group</span>
            <Check aria-hidden className="size-4 text-accent-text" />
          </Link>
          {ENTITY_LINKS.map((e) => (
            <Link key={e.to} to={e.to} onClick={() => { close(); onNavigate?.() }} className={menuItem}>
              <span className="flex-1">{e.label}</span>
            </Link>
          ))}
        </div>
      )}
    </Popover>
  )
}

function ThemeRow({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useTheme()
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <ThemeToggle variant="ghost" size="icon" />
      </div>
    )
  }
  return (
    <div className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted">
      <Moon aria-hidden className="size-[18px]" />
      <span className="flex-1">Dark theme</span>
      <Switch label="Dark theme" checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} />
    </div>
  )
}

/**
 * v2 sidebar: a white panel on the left edge holding the T-code field and the SAP-style menu tree.
 * Collapsed, it shows one icon per top folder. v1 uses a floating ink icon rail; keep the two apart.
 */
export function SidebarContent({ collapsed, onNavigate, onClose, onExpand }: SidebarProps) {
  const { records } = useServices()
  const toast = useToast()
  const { tree, counts, approvals } = useMenu()
  const trail = useTrail()

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5', collapsed ? 'justify-center' : 'px-5')}>
        <Link to="/" onClick={onNavigate} aria-label="Satona ERP, overview" className="flex items-center gap-2.5">
          <BrandMark className="size-7 text-fg" />
          {!collapsed && (
            <span className="text-base font-bold tracking-tight">
              Satona ERP<span className="text-accent">.</span>
            </span>
          )}
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Close menu" className="ml-auto" onClick={onClose}>
            <X aria-hidden className="size-5" />
          </Button>
        )}
      </div>

      <div className="space-y-3 px-3">
        <WorkspaceSwitcher collapsed={collapsed} onNavigate={onNavigate} />
        {!collapsed && <CommandField tree={tree} onNavigate={onNavigate} />}
      </div>

      <nav aria-label="Main" className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {collapsed ? (
          <ul className="space-y-1">
            {tree.map((n) => {
              const Icon = TOP_ICON[n.id] ?? Folder
              const here = trail[0]?.id === n.id
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    title={n.label}
                    onClick={() => onExpand?.()}
                    className={cn('relative grid h-10 w-full cursor-pointer place-items-center rounded-xl transition-colors', here ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-raised hover:text-fg')}
                  >
                    {here && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-accent" />}
                    <Icon aria-hidden className="size-[18px]" />
                    <span className="sr-only">{n.label}, expand the menu</span>
                    {n.id === 'cockpit' && approvals > 0 && <span aria-hidden className="absolute top-2 right-2.5 size-2 rounded-full bg-accent ring-2 ring-card" />}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <MenuTree tree={tree} active={trail} counts={counts} onNavigate={onNavigate} />
        )}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-line px-3 pt-3 pb-4">
        <ThemeRow collapsed={collapsed} />
        <button
          type="button"
          title={collapsed ? 'Reset demo data' : undefined}
          onClick={async () => {
            await records.reset()
            toast({ title: 'Demo data reset', description: 'Every module is back to its seed records.' })
          }}
          className={cn('flex h-10 w-full cursor-pointer items-center gap-3 rounded-xl text-sm font-medium text-muted hover:bg-raised hover:text-fg', collapsed ? 'justify-center' : 'px-3')}
        >
          <RotateCcw aria-hidden className="size-[18px]" />
          {collapsed ? <span className="sr-only">Reset demo data</span> : 'Reset demo data'}
        </button>
        <div className="pt-1">
          <RoleSwitcher collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  )
}

/** Desktop and tablet: the attached panel with its collapse handle on the right edge. */
export function Sidebar({ collapsed, onToggle, ...props }: Omit<SidebarProps, 'onClose' | 'onNavigate' | 'onExpand'> & { onToggle: () => void }) {
  // On tablets (768 to 1023 px) the open panel slides over the page and closes after a pick, so content keeps its width.
  const closeOnTablet = () => {
    if (!collapsed && window.innerWidth < 1024) onToggle()
  }
  return (
    <div className={cn('relative hidden shrink-0 md:block', collapsed ? 'w-[72px]' : 'w-[72px] lg:w-72')}>
      {!collapsed && <button type="button" aria-label="Close menu" onClick={onToggle} className="fixed inset-0 z-30 animate-fade bg-ink/30 lg:hidden" />}
      <aside
        className={cn(
          'absolute inset-y-0 left-0 z-40 border-r border-line bg-card transition-[width] duration-200 lg:static lg:h-full',
          collapsed ? 'w-[72px]' : 'w-72 shadow-float lg:shadow-none',
        )}
      >
        <SidebarContent collapsed={collapsed} onExpand={onToggle} onNavigate={closeOnTablet} {...props} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="absolute top-[76px] -right-3.5 z-10 grid size-7 cursor-pointer place-items-center rounded-full border border-line bg-card text-muted shadow-card transition-colors hover:text-fg"
        >
          {collapsed ? <ChevronsRight aria-hidden className="size-4" /> : <ChevronsLeft aria-hidden className="size-4" />}
        </button>
      </aside>
    </div>
  )
}
