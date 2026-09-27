import type { ICriterion, IJobInfo, IStudy, VerdictKind } from '@/types'

/* Verdict derivation — section 3 of context/system_flows.md.
   ML returns a binary metadata.verdict while the amber level hides in details:
   for the lesser trochanter "проверить" means ok: 1, for foreign objects ok: 0.
   This rule lives here and nowhere else. */
export function verdictOf(job: IJobInfo): VerdictKind {
  if (job.status === 'failed') return 'failed'
  if (job.status !== 'completed') return 'wait'

  const meta = job.metadata ?? {}
  const criteria = meta.criteria ?? {}
  if (meta.verdict === null || meta.verdict === undefined) return 'none'

  const trochanter = criteria.lesser_trochanter
  const foreign = criteria.foreign_objects
  const trochanterCheck = trochanter?.details?.status === 'проверить'
  const foreignCheck = foreign?.details?.verdict === 'проверить'

  if (meta.verdict === 1) return trochanterCheck ? 'warn' : 'ok'

  const broken = Object.keys(criteria).filter((key) => criteria[key].ok === 0)
  if (broken.length === 1 && broken[0] === 'foreign_objects' && foreignCheck) return 'warn'
  return 'bad'
}

/* Overlay colour is derived from the response exactly as in qc_prototype/render.py. */
export function levelOfCriterion(criterion?: ICriterion): VerdictKind | '' {
  if (!criterion || criterion.ok === null || criterion.ok === undefined) return ''
  const details = criterion.details ?? {}
  if (details.status === 'проверить' || details.verdict === 'проверить') return 'warn'
  return criterion.ok === 1 ? 'ok' : 'bad'
}

const RANK: Record<VerdictKind, number> = {
  failed: 0,
  bad: 1,
  warn: 2,
  wait: 3,
  none: 4,
  ok: 5,
}

/* A visit verdict is the worst verdict among its scans. */
export function studyVerdict(study: IStudy): VerdictKind {
  let worst: VerdictKind = 'ok'
  for (const job of study.jobs) {
    const kind = verdictOf(job)
    if (RANK[kind] < RANK[worst]) worst = kind
  }
  return worst
}

/* Group jobs into visits. study_id was requested from the backend developer;
   the column already exists in his dicom_file table. */
export function groupByStudy(jobs: IJobInfo[]): IStudy[] {
  const order: IStudy[] = []
  const map = new Map<string, IStudy>()

  for (const job of jobs) {
    const key = job.study_id ?? job.metadata?.study_id ?? job.id
    let study = map.get(key)
    if (!study) {
      study = {
        study_id: key,
        patient_ref: job.patient_ref ?? job.metadata?.patient_ref,
        created_at: job.created_at,
        jobs: [],
      }
      map.set(key, study)
      order.push(study)
    }
    study.jobs.push(job)
    if (job.created_at < study.created_at) study.created_at = job.created_at
  }

  return order
}
