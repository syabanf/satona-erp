import { cn } from '@/lib/cn'

/** Thin progress bar. `tone` picks the fill; the track is always the raised grey. */
export function Meter({ value, tone = 'fg', className, label }: { value: number; tone?: 'fg' | 'accent' | 'info' | 'success'; className?: string; label: string }) {
  const fill = { fg: 'bg-fg', accent: 'bg-accent', info: 'bg-info', success: 'bg-success' }[tone]
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className={cn('h-1.5 overflow-hidden rounded-full bg-control', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill)} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
    </div>
  )
}
