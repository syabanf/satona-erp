import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { CountUp } from '../../ui/Motion'

/** A cockpit number that counts up and opens the records behind it. */
export function KpiTile({ label, value, format, to, accent, note }: { label: string; value: number; format: (v: number) => string; to: string; accent?: boolean; note?: string }) {
  return (
    <Link
      to={to}
      data-motion="rise"
      className={cn(
        'block rounded-card border p-5 shadow-card transition-[background-color,translate] duration-300 active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1',
        accent ? 'border-transparent bg-invert text-on-invert' : 'border-line bg-card',
      )}
    >
      <p className={cn('text-xs', accent ? 'opacity-70' : 'text-muted')}>{label}</p>
      <p className="mt-2 text-[26px] font-medium tracking-tight tabular">
        <CountUp value={value} format={format} />
      </p>
      {note && <p className={cn('mt-0.5 text-xs', accent ? 'opacity-70' : 'text-muted')}>{note}</p>}
    </Link>
  )
}
