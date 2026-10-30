import { Search } from 'lucide-react'
import { usePalette } from './palette'

/** The sidebar search: opens tasks, records, menus and T-codes. */
export function CommandField() {
  const open = usePalette()
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={() => open()}
      className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-raised px-3.5 text-left text-sm text-subtle transition-colors hover:text-muted"
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1 truncate">Mau mengerjakan apa?</span>
      <kbd className="rounded-md border border-line bg-card px-1.5 font-mono text-[11px] text-muted">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}
