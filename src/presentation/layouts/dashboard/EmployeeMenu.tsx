import { Link, useLocation } from 'react-router'
import { BadgeCheck, Banknote, BarChart3, CalendarCheck, CheckCheck, Clock, GraduationCap, HardHat, HeartPulse, House, Megaphone, Receipt, Send, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react'
import { selfMenuFor, selfPath } from '@/domain/selfService'
import { cn } from '@/lib/cn'
import { useSession } from '../../hooks/useSession'

const SELF_ICON: Record<string, LucideIcon> = {
  '': House,
  announcements: Megaphone,
  approvals: CheckCheck,
  attendance: CalendarCheck,
  leaves: Send,
  overtime: Clock,
  team: Users,
  payslips: Receipt,
  loans: Banknote,
  advances: Wallet,
  appraisals: BarChart3,
  trainings: GraduationCap,
  mcu: HeartPulse,
  licences: BadgeCheck,
  ppe: HardHat,
  profile: UserRound,
}

/** The employee area menu: every page one tap away under its group label. Collapsed, the labels become hairlines. */
export function EmployeeMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const { role } = useSession()
  return (
    <div className={cn(collapsed ? 'space-y-2' : 'space-y-4')}>
      {selfMenuFor(role).map(([group, items], gi) => (
        <section key={group} className={cn(collapsed && gi > 0 && 'border-t border-line pt-2')}>
          {!collapsed && <p className="px-3 pb-1 eyebrow">{group}</p>}
          <ul className="space-y-0.5">
            {items.map((item) => {
              const to = selfPath(item.id)
              const on = pathname === to
              const Icon = SELF_ICON[item.id] ?? House
              return (
                <li key={item.id}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl text-[15px] font-medium transition-colors',
                      collapsed ? 'justify-center' : 'px-3',
                      on ? 'bg-accent-soft text-accent-text' : 'text-body hover:bg-raised hover:text-fg',
                    )}
                  >
                    <Icon aria-hidden className="size-[18px] shrink-0" />
                    {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
