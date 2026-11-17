import { Link } from 'react-router'
import { Building2, UserRound } from 'lucide-react'
import { homeFor } from '@/domain/menu'
import { AREA_LABEL, EMPLOYEE_HOME, type Area } from '@/domain/selfService'
import { cn } from '@/lib/cn'
import { useSession } from '../hooks/useSession'

const ICON = { backoffice: Building2, employee: UserRound } as const

/** The two halves of the console as a segmented switch: the back office menu and the employee area. `compact` stacks icons. */
export function AreaSwitch({ current, compact = false, onNavigate, className }: { current: Area; compact?: boolean; onNavigate?: () => void; className?: string }) {
  const { role } = useSession()
  return (
    <nav aria-label="Pilih area" className={cn('flex min-w-0 rounded-full bg-control p-1', compact && 'flex-col rounded-2xl', className)}>
      {(['backoffice', 'employee'] as const).map((area) => {
        const on = area === current
        const Icon = ICON[area]
        return (
          <Link
            key={area}
            to={area === 'employee' ? EMPLOYEE_HOME : homeFor(role)}
            onClick={onNavigate}
            aria-current={on ? 'page' : undefined}
            title={compact ? AREA_LABEL[area] : undefined}
            className={cn(
              'inline-flex h-9 min-w-0 flex-auto items-center justify-center rounded-full px-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
              on ? 'bg-accent-strong text-white shadow-card' : 'text-muted hover:text-fg',
              compact && 'size-9 flex-none px-0',
            )}
          >
            {compact ? (
              <>
                <Icon aria-hidden className="size-4" />
                <span className="sr-only">{AREA_LABEL[area]}</span>
              </>
            ) : (
              <span className="truncate">{AREA_LABEL[area]}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
