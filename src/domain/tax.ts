/** Tax and currency arithmetic of invoices: the document amount is the tax base (DPP) in its own currency. */
import type { ErpRecord, Values } from './records'

export const TAXES = ['PPN 11%', 'Tanpa PPN'] as const
export const WITHHOLDINGS = ['Tanpa PPh', 'PPh 23 2%', 'PPh 22 1,5%', 'PPh 4(2) 10%'] as const
export const VAT_CREDIT = ['Credited', 'Deferred', 'Not creditable'] as const

/** Rate and payable account of each income tax a buyer withholds: PPh 23 on services, PPh 22 on goods from state-linked sellers and imports, PPh 4(2) final on rent and construction. */
export const WITHHOLDING: Record<string, { rate: number; account: string; label: string }> = {
  'PPh 23 2%': { rate: 0.02, account: '2230', label: 'PPh 23' },
  'PPh 22 1,5%': { rate: 0.015, account: '2250', label: 'PPh 22' },
  'PPh 4(2) 10%': { rate: 0.1, account: '2240', label: 'PPh 4(2)' },
}
export const DOC_CURRENCIES = ['IDR', 'USD'] as const

const n = (v: unknown) => Number(v) || 0
export const isForeign = (v: Values) => Boolean(v.currency) && v.currency !== 'IDR'
const rateOf = (v: Values) => (isForeign(v) ? n(v.rate) || 1 : 1)

/** The tax base in rupiah at the rate the document was booked at. */
export const baseIdr = (v: Values) => Math.round(n(v.amount) * rateOf(v))
export const ppnOf = (v: Values) => (v.tax === 'PPN 11%' ? Math.round(baseIdr(v) * 0.11) : 0)
/** Income tax the payer withholds from the invoice and remits to the tax office. */
export const withheldOf = (v: Values) => Math.round(baseIdr(v) * (WITHHOLDING[String(v.withholding)]?.rate ?? 0))
/** What changes hands: base plus PPN less the tax withheld, in rupiah. */
export const docTotal = (v: Values) => baseIdr(v) + ppnOf(v) - withheldOf(v)

/** The newest active rate of a currency to rupiah; 0 when the rate table has none. */
export function currentRate(fx: readonly ErpRecord[], currency: string): number {
  const rows = fx.filter((r) => r.values.currency === currency && r.status !== 'inactive').toSorted((a, b) => String(b.values.date).localeCompare(String(a.values.date)))
  return n(rows[0]?.values.rate)
}

/** The document revalued at today's rate; a rupiah document stays as booked. */
export const totalAt = (v: Values, fx: readonly ErpRecord[]) => (isForeign(v) ? docTotal({ ...v, rate: currentRate(fx, String(v.currency)) || v.rate }) : docTotal(v))
