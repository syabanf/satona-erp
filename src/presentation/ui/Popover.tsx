import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PopoverProps {
  /** Renders the trigger; spread `props` onto a button. */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-controls': string }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  /** Width class; `cn` does not resolve Tailwind conflicts, so it lives apart from `className`. */
  width?: string
  /** Opens above the trigger, for menus that sit at the bottom of the screen. */
  side?: 'bottom' | 'top'
  className?: string
}

/** Anchored panel that closes on outside click and Escape, handing focus back to its trigger. */
export function Popover({ trigger, children, align = 'right', width = 'w-64', side = 'bottom', className }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      root.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-controls': id })}
      {open && (
        <div
          id={id}
          className={cn(
            'absolute z-40 max-w-[calc(100vw-2rem)] animate-rise rounded-panel border border-line-strong bg-card p-2 shadow-float',
            width,
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** A row inside a popover menu. */
export const menuItem =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-raised hover:text-fg'
