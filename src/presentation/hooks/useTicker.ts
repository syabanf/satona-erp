import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../ui/animate'

/** Seconds since mount, updated about `fps` times a second. Stays at 0 under reduced motion. */
export function useTicker(fps = 12) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const start = performance.now()
    let last = 0
    let frame = requestAnimationFrame(function tick(now) {
      if (now - last > 1000 / fps) {
        last = now
        setElapsed((now - start) / 1000)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [fps])
  return elapsed
}
