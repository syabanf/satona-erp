import { Link } from 'react-router'
import { cn } from '@/lib/cn'

export interface Bar {
  key: string
  label: string
  value: number
  text?: string
  to?: string
  alert?: boolean
}

/** Ranked rows with a proportional bar; each row links to the records behind it. */
export function BarList({ items, empty = 'Nothing to show yet.' }: { items: readonly Bar[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>
  const max = Math.max(1, ...items.map((b) => b.value))
  return (
    <ul className="space-y-2.5">
      {items.map((b) => {
        const body = (
          <>
            <span className="flex justify-between gap-2 text-sm">
              <span className="truncate">{b.label}</span>
              <span className={cn('shrink-0 text-xs tabular', b.alert ? 'font-semibold text-accent-text' : 'text-muted')}>{b.text ?? b.value}</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-control">
              <span className={cn('block h-full rounded-full transition-[width] duration-700', b.alert ? 'bg-accent' : 'bg-fg')} style={{ width: `${(b.value / max) * 100}%` }} />
            </span>
          </>
        )
        return <li key={b.key}>{b.to ? <Link to={b.to} className="block hover:opacity-80">{body}</Link> : body}</li>
      })}
    </ul>
  )
}
