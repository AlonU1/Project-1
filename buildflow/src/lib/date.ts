import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

export const todayISO = () => format(new Date(), 'yyyy-MM-dd')

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'd.M.yyyy') } catch { return iso }
}

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'd.M.yyyy HH:mm') } catch { return iso }
}

export const fmtRel = (iso?: string | null) => {
  if (!iso) return ''
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: he }) } catch { return '' }
}

export const daysUntil = (iso?: string | null) => {
  if (!iso) return null
  try { return differenceInCalendarDays(parseISO(iso), new Date()) } catch { return null }
}

export const isoDaysFromNow = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return format(d, 'yyyy-MM-dd')
}

export const isoAgo = (days: number, hours = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}
