import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { stretchPill } from './animate'

export interface TabOption<T extends string> {
  value: T
  label: string
}

interface TabsProps<T extends string> {
  options: readonly TabOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** `pill`: white active pill in a dark track. `underline`: text tabs with an accent rule. */
  variant?: 'pill' | 'underline'
  className?: string
}

/** Single-select view switch with roving arrow keys. */
export function Tabs<T extends string>({ options, value, onChange, label, variant = 'pill', className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const track = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const activeIndex = options.findIndex((o) => o.value === value)

  useLayoutEffect(() => {
    if (variant !== 'pill' || !pill.current || !track.current) return
    stretchPill(pill.current, track.current, refs.current[activeIndex] ?? null)
  }, [variant, activeIndex, options.length])

  useLayoutEffect(() => {
    const t = track.current
    if (variant !== 'pill' || !t) return
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) return void (first = false)
      if (pill.current) stretchPill(pill.current, t, refs.current[activeIndex] ?? null, false)
    })
    observer.observe(t)
    return () => observer.disconnect()
  }, [variant, activeIndex])

  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center',
        variant === 'pill' ? 'relative gap-0.5 rounded-full border border-line-strong bg-raised p-1' : 'gap-5',
        className,
      )}
    >
      {variant === 'pill' && <span ref={pill} aria-hidden className="pointer-events-none absolute top-0 left-0 h-full bg-invert opacity-0" />}
      {options.map((option, i) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'cursor-pointer text-sm whitespace-nowrap transition-colors',
              variant === 'pill' && 'relative h-8 rounded-full px-3.5',
              variant === 'pill' && (active ? 'font-medium text-on-invert' : 'text-muted hover:text-fg'),
              variant === 'underline' && 'border-b-2 pb-1.5',
              variant === 'underline' && (active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'),
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
