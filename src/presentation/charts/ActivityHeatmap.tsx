import { cn } from '@/lib/cn'

/**
 * Twelve weeks of daily counts as a week-by-week grid, darker red for busier days.
 * Columns are weeks, rows Monday to Sunday; hover a cell for its date and count, click it to open that day.
 */
export function ActivityHeatmap({ days, label, className, onDay }: { days: ReadonlyArray<{ day: string; count: number }>; label: string; className?: string; onDay?: (day: string) => void }) {
  const max = Math.max(1, ...days.map((d) => d.count))
  const lead = (new Date(`${days[0]?.day ?? '2026-01-01'}T00:00:00Z`).getUTCDay() + 6) % 7
  const cells = [...Array.from({ length: lead }, () => null), ...days]
  const weeks = Math.ceil(cells.length / 7)
  return (
    <div className={cn('overflow-x-auto', className)}>
      <div role="group" aria-label={label} className="grid w-max grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {cells.map((d, i) =>
          d ? (
            <button
              type="button"
              key={d.day}
              title={`${d.day}: ${d.count}`}
              aria-label={`${d.day}: ${d.count}`}
              disabled={!onDay || !d.count}
              onClick={() => onDay?.(d.day)}
              className="size-3.5 rounded-[4px] transition-transform enabled:cursor-pointer hover:scale-125 sm:size-4"
              style={{ background: d.count ? `color-mix(in oklab, var(--color-accent) ${20 + (d.count / max) * 80}%, var(--color-raised))` : 'var(--color-control)' }}
            />
          ) : (
            <span key={`pad-${i}`} className="size-3.5 sm:size-4" />
          ),
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        Less
        {[0, 0.3, 0.6, 1].map((v) => (
          <span key={v} className="size-3 rounded-[3px]" style={{ background: v ? `color-mix(in oklab, var(--color-accent) ${20 + v * 80}%, var(--color-raised))` : 'var(--color-control)' }} />
        ))}
        More
      </div>
    </div>
  )
}
