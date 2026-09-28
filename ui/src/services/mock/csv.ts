import type { IJobInfo, Region } from '@/types'

/* The file п.2.5 ТЗ asks for: one row per image, the exact eight columns,
   the exact closed violation_type dictionary — copied character for character
   from context/orgs_qa.md (organisers' answer to question 6) and reasoned
   through in context/tz_interpretation.md §2.5/Р2/Р4. This is the artefact
   the submission is graded on, so demo mode has to hand over the same shape
   the real dicom-manager report does — not the earlier doctor-facing report. */

const REGION_TITLE: Record<Region, string> = {
  spine: 'Поясничный отдел позвоночника',
  hip_left: 'Проксимальный отдел бедра',
  hip_right: 'Проксимальный отдел бедра',
}

/* §Р4: the report's quality_class is the OR of the criteria themselves, not
   the softened station verdict (which folds "проверить" into a pass). */
function brokenCriteria(job: IJobInfo): Set<string> {
  const criteria = job.metadata?.criteria ?? {}
  return new Set(Object.keys(criteria).filter((key) => criteria[key].ok === 0))
}

/* §Р2, closed by the organisers: the hip's positioning and rotation collapse
   into one `Некорректная укладка`; the spine keeps its own three. */
function violationsOf(job: IJobInfo): string[] {
  const broken = brokenCriteria(job)

  if (job.anatomical_region === 'spine') {
    return [
      broken.has('pelvis_crest') && 'Некорректная укладка',
      broken.has('spine_axis') && 'Не выравнена ось позвоночника',
      broken.has('foreign_objects') && 'Присутствуют посторонние предметы',
    ].filter((value): value is string => !!value)
  }

  if (job.anatomical_region === 'hip_left' || job.anatomical_region === 'hip_right') {
    return [
      (broken.has('hip_margins') || broken.has('lesser_trochanter')) && 'Некорректная укладка',
      broken.has('hip_keypoints') && 'Некорректная область интереса',
    ].filter((value): value is string => !!value)
  }

  return []
}

const COLUMNS = [
  'path_to_study',
  'study_uid',
  'image_uid',
  'anatomical_region',
  'quality_class',
  'violation_type',
  'processing_status',
  'time_of_processing',
]

/* RFC 4180: comma-separated, quotes doubled. Semicolon is spoken for already —
   it is the separator *inside* violation_type. */
const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

const row = (values: string[]) => values.map(cell).join(',')

/* Byte order mark, otherwise Excel opens the Cyrillic text as mojibake. */
const BOM = String.fromCharCode(0xfeff)

export function reportCsv(jobs: IJobInfo[]) {
  const lines = [row(COLUMNS)]

  for (const job of jobs) {
    const violations = violationsOf(job)

    lines.push(
      row([
        job.file_name ?? job.id,
        job.study_id ?? '',
        job.dicom_id,
        job.anatomical_region ? REGION_TITLE[job.anatomical_region] : '',
        violations.length ? '1' : '0',
        violations.join(';'),
        job.status === 'failed' ? 'Failure' : 'Success',
        job.duration_ms !== null && job.duration_ms !== undefined
          ? String(job.duration_ms / 1000)
          : '',
      ]),
    )
  }

  return `${BOM}${lines.join('\r\n')}\r\n`
}

export const csvDataUrl = (csv: string) =>
  `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
