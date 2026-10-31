import { cn } from '@/lib/cn'

/** The Satona logo from `public/satona-logo.png`, a square box sized by `className`. */
export function BrandMark({ className }: { className?: string }) {
  return <img src="/satona-logo.png" alt="Satona" className={cn('size-8 shrink-0 object-contain', className)} />
}
