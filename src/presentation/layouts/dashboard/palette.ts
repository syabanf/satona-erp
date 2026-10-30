import { createContext, useContext } from 'react'

export const PaletteContext = createContext<((query?: string) => void) | null>(null)

/** Opens the global search palette, optionally with a starting query. */
export function usePalette() {
  const open = useContext(PaletteContext)
  if (!open) throw new Error('usePalette needs CommandPalette')
  return open
}
