/** CMMS rules that read across records: meter-based PM, condition trends, asset value and part issues. */

const DAY = 86_400_000
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY

export type Condition = 'Normal' | 'Warning' | 'Alarm'

/** A reading against its alarm limit: from 80% of the limit it warns, at the limit it alarms. */
export const conditionOf = (value: number, limit: number): Condition => (limit > 0 && value >= limit ? 'Alarm' : limit > 0 && value >= limit * 0.8 ? 'Warning' : 'Normal')

/**
 * Fits a straight line through dated readings and says when it crosses the alarm limit.
 * `daysToLimit` is 0 once the latest reading is at the limit, and undefined while the trend is flat or falling.
 */
export function predict(readings: ReadonlyArray<{ date: string; value: number }>, limit: number, today: string) {
  const pts = [...readings].sort((a, b) => a.date.localeCompare(b.date))
  const last = pts.at(-1)
  if (!last) return { latest: 0, slope: 0, condition: 'Normal' as Condition, daysToLimit: undefined }
  const xs = pts.map((p) => days(today, p.date))
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = pts.reduce((s, p) => s + p.value, 0) / pts.length
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const slope = den ? xs.reduce((s, x, i) => s + (x - mx) * (pts[i]!.value - my), 0) / den : 0
  const condition = conditionOf(last.value, limit)
  const daysToLimit = last.value >= limit ? 0 : slope > 0 ? Math.max(0, Math.round((limit - last.value) / slope - days(last.date, today))) : undefined
  return { latest: last.value, slope, condition, daysToLimit }
}

/** Straight-line depreciation to zero over the useful life, plus running hours against calendar hours since commissioning. */
export function assetValue(cost: number, commissioned: string, lifeYears: number, runHours: number, today: string) {
  const age = Math.max(0, days(commissioned, today) / 365)
  const depreciation = lifeYears > 0 ? Math.min(cost, (cost * age) / lifeYears) : 0
  const calendar = Math.max(1, days(commissioned, today) * 24)
  return { ageYears: age, depreciation: Math.round(depreciation), book: Math.round(cost - depreciation), utilisation: Math.min(1, runHours / calendar) }
}

/** Meter-based PM: due at the last service reading plus the interval; due now once the asset's meter passes it. */
export function meterDue(lastDoneAt: number, interval: number, runHours: number) {
  const nextAt = lastDoneAt + interval
  return { nextAt, remaining: nextAt - runHours, due: runHours >= nextAt }
}

/** Issuing parts to a work order takes them from stock; the store cannot issue more than it holds. */
export function issueParts(onHand: number, qty: number) {
  return qty > onHand ? { blocker: `Only ${onHand} in stock, ${qty} requested`, onHand } : { blocker: undefined, onHand: onHand - qty }
}
