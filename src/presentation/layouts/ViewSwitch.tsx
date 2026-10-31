import { Link } from 'react-router'
import { LayoutDashboard, Monitor } from 'lucide-react'
import { cn } from '@/lib/cn'

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard view', to: '/', icon: LayoutDashboard },
  { id: 'os', label: 'OS view', to: '/os', icon: Monitor },
] as const

/** Switches between the dashboard and the OS desktop; the current one is the filled segment. `compact` shows icons only. */
export function ViewSwitch({ current, compact = false, className }: { current: 'dashboard' | 'os'; compact?: boolean; className?: string }) {
  return (
    <nav aria-label="Pilih tampilan" className={cn('flex rounded-full border border-line bg-raised p-1', compact && 'flex-col rounded-2xl', className)}>
      {VIEWS.map((v) => {
        const on = v.id === current
        return (
          <Link
            key={v.id}
            to={v.to}
            aria-current={on ? 'page' : undefined}
            title={compact ? v.label : undefined}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
              on ? 'bg-invert text-on-invert shadow-card' : 'text-muted hover:text-fg',
              compact && 'size-9 flex-none px-0',
            )}
          >
            <v.icon aria-hidden className="size-4 shrink-0" />
            {compact ? <span className="sr-only">{v.label}</span> : v.label}
          </Link>
        )
      })}
    </nav>
  )
}
