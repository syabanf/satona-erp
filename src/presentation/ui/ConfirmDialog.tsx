import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children?: ReactNode
  confirm: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Modal for destructive steps. Escape and the overlay cancel; focus starts on Cancel and returns on close. */
export function ConfirmDialog({ open, title, children, confirm, busy, onConfirm, onClose }: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-[1000] grid place-items-center p-4">
      <button type="button" aria-label="Cancel" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-rise rounded-card border border-line bg-card p-6 shadow-float">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        {children && <div className="mt-2 text-sm text-body">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancel} variant="soft" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
