import { DECISION, REGION_SHORT, VERDICT_LIST } from '@/constants'
import { brokenNames } from '@/lib/criteria'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

/* The report the backend will generate. Built here so that the Download button
   hands over a real file instead of showing a toast: download_url is a data URL
   in demo mode and an S3 link in production, and the UI links to it either way. */

const COLUMNS = [
  'Задача',
  'Файл',
  'Пациент',
  'Исследование',
  'Область',
  'Вердикт',
  'Нарушения',
  'Решение специалиста',
  'Специалист',
  'Комментарий',
  'Поступило',
]

/* Excel on a Russian locale reads a semicolon-separated file; quotes are
   doubled the way RFC 4180 asks. */
const cell = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

const row = (values: string[]) => values.map(cell).join(';')

/* Byte order mark, otherwise Excel opens the Cyrillic text as mojibake. */
const BOM = String.fromCharCode(0xfeff)

export function reportCsv(jobs: IJobInfo[]) {
  const lines = [row(COLUMNS)]

  for (const job of jobs) {
    lines.push(
      row([
        job.id,
        job.file_name ?? '',
        job.patient_ref ?? '',
        job.study_id ?? '',
        job.anatomical_region ? REGION_SHORT[job.anatomical_region] : '',
        VERDICT_LIST[verdictOf(job)].title,
        brokenNames(job).join(', '),
        job.specialist_decision ? DECISION[job.specialist_decision] : 'не принято',
        job.specialist_name ?? '',
        job.comment ?? '',
        job.created_at.replace('T', ' '),
      ]),
    )
  }

  return `${BOM}${lines.join('\r\n')}\r\n`
}

export const csvDataUrl = (csv: string) =>
  `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
