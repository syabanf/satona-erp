import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Filter state in the URL. `set` replaces the entry and drops empty values, so Back skips filter clicks. */
export function useQueryState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? undefined])) as Record<K, string | undefined>
  const set = useCallback(
    (patch: Partial<Record<K, string | undefined>>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch) as Array<[string, string | undefined]>) {
            if (v) next.set(k, v)
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  return [values, set] as const
}
