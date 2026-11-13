import { useCallback, useState } from 'react'

/** A per-viewer value in localStorage; storage may be blocked, so every access is guarded. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) return JSON.parse(saved) as T
    } catch {
      // Blocked storage: start from the default.
    }
    return initial
  })
  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Blocked storage: the change lasts for this page only.
      }
    },
    [key],
  )
  return [value, update] as const
}
