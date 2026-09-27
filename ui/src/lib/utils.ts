import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { REGION_SHORT, STATUS } from '@/constants'
import type { IJobInfo } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* Числа по-русски: запятая как разделитель и настоящий минус. */
export function nm(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(digits).replace('.', ',').replace('-', '\u2212')
}

export function timeOf(iso: string) {
  return iso.slice(11, 16)
}

export function whenOf(iso: string) {
  const today = new Date().toISOString().slice(0, 10)
  const day = iso.slice(0, 10)
  if (day === today) return `сегодня, ${timeOf(iso)}`
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

/* Пока снимок не обработан, вместо области показываем состояние. */
export function zoneLabel(job: IJobInfo) {
  return job.anatomical_region ? REGION_SHORT[job.anatomical_region] : STATUS[job.status]
}
