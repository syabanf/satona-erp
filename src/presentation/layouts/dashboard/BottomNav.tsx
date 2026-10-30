import { NavLink, useLocation } from 'react-router'
import { BarChart3, CheckCheck, ClipboardList, House, LayoutGrid, type LucideIcon } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import { can, type Access, type Role } from '@/domain/erp'
import { homeFor } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { recordPath } from '../../records/text'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

/** Four tabs for the signed-in role: its home, its main worklist, approvals (or insight for portal users), and the full menu. */
function tabsFor(role: Role, access: Access, approvals: number): Tab[] {
  const work = typesOf(role.module).find((t) => t.area === 'transaction')
  const tabs: Tab[] = [
    { to: homeFor(role), label: 'Home', icon: House },
    work ? { to: recordPath(work), label: role.module.toUpperCase(), icon: ClipboardList } : { to: '/modules', label: 'Modules', icon: ClipboardList },
  ]
  tabs.push(can(access, 'approve') || approvals > 0 ? { to: '/approvals', label: 'Approvals', icon: CheckCheck, badge: approvals } : { to: `/modules/${role.module}`, label: 'Insight', icon: BarChart3 })
  return tabs
}

/** Phone navigation: a floating ink tab bar in place of the hamburger, with the full menu one tap away. */
export function BottomNav({ role, access, approvals, onMenu, menuOpen }: { role: Role; access: Access; approvals: number; onMenu: () => void; menuOpen: boolean }) {
  const { pathname } = useLocation()
  const tabs = tabsFor(role, access, approvals)
  const item = 'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium'
  const square = (on: boolean) => cn('grid size-10 place-items-center rounded-2xl transition-all duration-300', on ? 'bg-accent text-white shadow-glow' : 'text-on-ink-muted')

  return (
    <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-40 flex h-[68px] rounded-[22px] bg-ink px-1 pb-[env(safe-area-inset-bottom)] shadow-float md:hidden">
      {tabs.map((t) => {
        const base = t.to.split('?')[0] ?? t.to
        const on = !menuOpen && (base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`))
        return (
          <NavLink key={t.label} to={t.to} aria-current={on ? 'page' : undefined} className={item}>
            <span className={square(on)}>
              <t.icon aria-hidden className="size-5" />
            </span>
            <span className={on ? 'text-white' : 'text-on-ink-muted'}>{t.label}</span>
            {(t.badge ?? 0) > 0 && (
              <span className="absolute top-1.5 right-[22%] grid h-4.5 min-w-4.5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-ink tabular">{t.badge}</span>
            )}
          </NavLink>
        )
      })}
      <button type="button" onClick={onMenu} aria-expanded={menuOpen} aria-label="Open the full menu" className={cn(item, 'cursor-pointer')}>
        <span className={square(menuOpen)}>
          <LayoutGrid aria-hidden className="size-5" />
        </span>
        <span className={menuOpen ? 'text-white' : 'text-on-ink-muted'}>Menu</span>
      </button>
    </nav>
  )
}
