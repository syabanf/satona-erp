import { cn } from '@/lib/cn'
import { Button } from './Button'

interface FilterChipsProps<T extends string> {
  label: string
  options: ReadonlyArray<{ value: T; label: string }>
  value: T | undefined
  counts: Partial<Record<T, number>>
  total: number
  onChange: (value: T | undefined) => void
  className?: string
}

/** "All" plus one chip per value with its count. A second click on the active chip clears it. */
export function FilterChips<T extends string>({ label, options, value, counts, total, onChange, className }: FilterChipsProps<T>) {
  const chip = (key: T | undefined, text: string, n: number) => {
    const active = value === key
    return (
      <Button
        key={key ?? 'all'}
        size="sm"
        variant={active ? 'solid' : 'soft'}
        aria-pressed={active}
        className="shrink-0"
        onClick={() => onChange(active ? undefined : key)}
      >
        {text}
        <span className={cn('tabular', active ? 'opacity-60' : 'text-muted')}>{n}</span>
      </Button>
    )
  }
  return (
    <div role="group" aria-label={label} className={cn('no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1', className)}>
      {chip(undefined, 'All', total)}
      {options.map((o) => chip(o.value, o.label, counts[o.value] ?? 0))}
    </div>
  )
}
