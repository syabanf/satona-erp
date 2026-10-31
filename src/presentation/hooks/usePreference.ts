import { useCallback, useSyncExternalStore } from 'react'

/** Comfort settings kept as `data-*` flags on <html>, so CSS reacts without re-rendering the app. */
export type Preference = 'text' | 'codes'
const ON: Record<Preference, string> = { text: 'large', codes: 'show' }

const watch = (pref: Preference) => (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [`data-${pref}`] })
  return () => observer.disconnect()
}
const SUBSCRIBE: Record<Preference, (onChange: () => void) => () => void> = { text: watch('text'), codes: watch('codes') }

/** Large text scales every rem; showing codes reveals the transaction codes expert users type. index.html restores both before paint. */
export function usePreference(pref: Preference) {
  const on = useSyncExternalStore(SUBSCRIBE[pref], () => document.documentElement.dataset[pref] === ON[pref])
  const set = useCallback(
    (next: boolean) => {
      if (next) document.documentElement.dataset[pref] = ON[pref]
      else delete document.documentElement.dataset[pref]
      try {
        if (next) localStorage.setItem(`satona-${pref}`, ON[pref])
        else localStorage.removeItem(`satona-${pref}`)
      } catch {
        // Blocked storage: the choice lasts for this page only.
      }
    },
    [pref],
  )
  return [on, set] as const
}
