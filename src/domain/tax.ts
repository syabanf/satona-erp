/** Tax and currency arithmetic of invoices: the document amount is the tax base (DPP) in its own currency. */
import type { ErpRecord, Values } from './records'

export const TAXES = ['PPN 11%', 'Tanpa PPN'] as const
export const WITHHOLDINGS = ['Tanpa PPh', 'PPh 23 2%'] as const
export const DOC_CURRENCIES = ['IDR', 'USD'] as const

const n = (v: unknown) => Number(v) || 0
export const isForeign = (v: Values) => Boolean(v.currency) && v.currency !== 'IDR'
const rateOf = (v: Values) => (isForeign(v) ? n(v.rate) || 1 : 1)

/** The tax base in rupiah at the rate the document was booked at. */
export const baseIdr = (v: Values) => Math.round(n(v.amount) * rateOf(v))
export const ppnOf = (v: Values) => (v.tax === 'PPN 11%' ? Math.round(baseIdr(v) * 0.11) : 0)
/** PPh 23 the payer withholds from a service invoice and remits to the tax office. */
export const pph23Of = (v: Values) => (v.withholding === 'PPh 23 2%' ? Math.round(baseIdr(v) * 0.02) : 0)
/** What changes hands: base plus PPN less the PPh 23 withheld, in rupiah. */
export const docTotal = (v: Values) => baseIdr(v) + ppnOf(v) - pph23Of(v)

/** The newest active rate of a currency to rupiah; 0 when the rate table has none. */
export function currentRate(fx: readonly ErpRecord[], currency: string): number {
  const rows = fx.filter((r) => r.values.currency === currency && r.status !== 'inactive').toSorted((a, b) => String(b.values.date).localeCompare(String(a.values.date)))
  return n(rows[0]?.values.rate)
}

/** The document revalued at today's rate; a rupiah document stays as booked. */
export const totalAt = (v: Values, fx: readonly ErpRecord[]) => (isForeign(v) ? docTotal({ ...v, rate: currentRate(fx, String(v.currency)) || v.rate }) : docTotal(v))
