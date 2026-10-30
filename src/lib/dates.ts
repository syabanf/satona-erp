/** Calendar dates as `YYYY-MM-DD` strings, formatted in UTC so time zones never shift a day. */
export type IsoDate = string

const parseIso = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`)
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

export const shortDay = (iso: IsoDate) => dayFmt.format(parseIso(iso))
export const shortWeekday = (iso: IsoDate) => weekdayFmt.format(parseIso(iso))
