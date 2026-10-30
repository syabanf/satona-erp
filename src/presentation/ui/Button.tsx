import { useCallback, type ButtonHTMLAttributes, type Ref } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useMagnetic } from './Motion'
import { buttonStyles, type ButtonSize, type ButtonVariant } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'soft',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...props
}: ButtonProps) {
  // The accent action follows a fine pointer; React 19 runs the cleanup the callback ref returns.
  const pull = useMagnetic(variant === 'accent' && size === 'md')
  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
      return pull(el)
    },
    [ref, pull],
  )
  return (
    <button
      ref={setRef}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
