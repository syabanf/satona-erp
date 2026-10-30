import { cn } from '@/lib/cn'

/** A ring that fills to `value` (0 to 100); red below 60, amber below 80, ink above. */
export function ScoreRing({ value, size = 56, label }: { value: number; size?: number; label: string }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const tone = value < 60 ? 'stroke-accent' : value < 80 ? 'stroke-warning' : 'stroke-fg'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(value)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-control" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={cn('transition-[stroke-dashoffset] duration-1000 ease-out', tone)}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-fg text-[13px] font-semibold">
        {Math.round(value)}
      </text>
    </svg>
  )
}
