import { createContext, useContext } from 'react'

export interface TourControls {
  /** Opens the help centre with the quick tour and the tutorials. */
  openHelp: () => void
  /** Starts a tour or tutorial by id. */
  start: (id: string) => void
}

export const TourContext = createContext<TourControls | null>(null)

export function useTour() {
  const tour = useContext(TourContext)
  if (!tour) throw new Error('useTour needs TourProvider')
  return tour
}

const DONE_KEY = 'satona-tutorials-done'

/** Finished tutorials per viewer; storage may be blocked, so every access is guarded. */
export function readDone(): ReadonlySet<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function markDone(id: string) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...readDone(), id]))
  } catch {
    // Without storage the tick simply does not persist.
  }
}
