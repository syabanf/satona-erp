/** System monitoring rules: how a service's health follows from the records that describe it. */

export type Health = 'up' | 'degraded' | 'down'

const RANK: Record<Health, number> = { up: 0, degraded: 1, down: 2 }

/** The worst health of several checks; no checks counts as up. */
export const worstHealth = (all: readonly Health[]): Health => all.reduce<Health>((w, h) => (RANK[h] > RANK[w] ? h : w), 'up')

/** Health from a share of failing parts: any failure degrades, `downAt` or more of them is down. */
export const healthOfShare = (failing: number, total: number, downAt = 0.3): Health => (!total || failing === 0 ? 'up' : failing / total >= downAt ? 'down' : 'degraded')
