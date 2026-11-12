import { describe, expect, it } from 'vitest'
import { healthOfShare, worstHealth } from './monitoring'

describe('system monitoring', () => {
  it('degrades on any failure and goes down from 30% failing', () => {
    expect(healthOfShare(0, 10)).toBe('up')
    expect(healthOfShare(1, 10)).toBe('degraded')
    expect(healthOfShare(3, 10)).toBe('down')
    expect(healthOfShare(0, 0)).toBe('up')
  })
  it('takes the worst of several checks', () => {
    expect(worstHealth(['up', 'degraded', 'up'])).toBe('degraded')
    expect(worstHealth(['up', 'down', 'degraded'])).toBe('down')
    expect(worstHealth([])).toBe('up')
  })
})
