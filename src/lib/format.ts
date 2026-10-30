const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const idrCompact = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const money = (value: number) => idr.format(value)
/** Rupiah in short form: "Rp 31,4 M" for miliar, "Rp 1,2 T" for triliun. */
export const moneyCompact = (value: number) => idrCompact.format(value)
export const count = (value: number) => plain.format(value)

/** 0.083 -> "8.3%". Pass `signed` for "+8.3%" / "-2.1%". */
export function percent(ratio: number, { signed = false, digits = 1 } = {}): string {
  const text = `${Math.abs(ratio * 100).toFixed(digits)}%`
  if (!signed) return ratio < 0 ? `-${text}` : text
  return `${ratio < 0 ? '-' : '+'}${text}`
}
