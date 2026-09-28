import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { REGION_SHORT, STATUS } from '@/constants'
import type { IJobInfo } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* Russian number format: comma as the decimal separator and a real minus sign. */
export function nm(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(digits).replace('.', ',').replace('-', '\u2212')
}

const MSK_OFFSET_MS = 3 * 3600 * 1000

/* The backend sends UTC; people read Moscow time (UTC+3). A stamp with no zone
   is a local one written by the browser itself (the station journal) and is
   shown as is. Returns 'YYYY-MM-DDTHH:MM'. */
function mskStamp(iso: string) {
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) return iso.slice(0, 16)
  return new Date(Date.parse(iso) + MSK_OFFSET_MS).toISOString().slice(0, 16)
}

export function timeOf(iso: string) {
  return mskStamp(iso).slice(11, 16)
}

/* Calendar day in Moscow time; without an argument — today. */
export function dayOf(iso?: string) {
  return mskStamp(iso ?? new Date().toISOString()).slice(0, 10)
}

export function whenOf(iso: string) {
  const day = dayOf(iso)
  if (day === dayOf()) return `сегодня, ${timeOf(iso)}`
  const [, month, date] = day.split('-')
  return `${date}.${month}, ${timeOf(iso)}`
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/* Until the scan is processed, show its status instead of the anatomical region. */
export function zoneLabel(job: IJobInfo) {
  return job.anatomical_region ? REGION_SHORT[job.anatomical_region] : STATUS[job.status]
}
