import { cn } from '@/lib/cn'

/**
 * The WIT logo from `public/`. The wordmark shows ink letters on light themes and white ones on dark themes;
 * `onDark` keeps it white on an ink panel. The square mark fits the collapsed sidebar.
 */
export function BrandMark({ className, variant = 'wordmark', onDark = false }: { className?: string; variant?: 'wordmark' | 'mark'; onDark?: boolean }) {
  if (variant === 'mark') return <img src="/favicon.svg" alt="WIT" className={cn('size-8 shrink-0', className)} />
  const word = cn('h-6 w-auto shrink-0', className)
  if (onDark) return <img src="/wit-logo.png" alt="WIT" className={word} />
  return (
    <>
      <img src="/wit-logo-ink.png" alt="WIT" className={cn('logo-light', word)} />
      <img src="/wit-logo.png" alt="" aria-hidden className={cn('logo-dark', word)} />
    </>
  )
}
