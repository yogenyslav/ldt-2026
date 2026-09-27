import { groupByStudy } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

/* What the technologist station is busy with right now.

   A visit stays open until one of its scans is accepted: a retake is another
   attempt within the same visit, not a new case. That is what keeps the earlier
   attempts on hand for comparison — and keeps attempts of other patients out of
   it, which matters more: comparing the scan on the table against somebody
   else's would be worse than not comparing at all.

   Pure on purpose: the station screen is hard to reason about otherwise. */

/* A visit left without an accepted scan for this long is not the patient on the
   table any more — the shift has moved on and the screen should not resume it. */
export const SESSION_WINDOW = 2 * 60 * 60 * 1000

export const isAccepted = (job: IJobInfo) =>
  job.specialist_decision === 'approved' || job.specialist_decision === 'force_approved'

export interface ISession {
  /* every scan of the visit, oldest first */
  attempts: IJobInfo[]
  /* the attempt waiting for a decision, if there is one */
  current?: IJobInfo
  /* the other attempts, newest first */
  history: IJobInfo[]
  patient: string
}

const EMPTY: ISession = { attempts: [], history: [], patient: '' }

export function openSession(jobs: IJobInfo[], now = Date.now()): ISession {
  const byTime = [...jobs].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const open = groupByStudy(byTime).find((study) => {
    if (study.jobs.some(isAccepted)) return false
    const last = study.jobs[study.jobs.length - 1]
    return now - Date.parse(last.created_at) < SESSION_WINDOW
  })

  if (!open) return EMPTY

  const current = open.jobs.find((job) => !job.specialist_decision)

  return {
    attempts: open.jobs,
    current,
    history: [...open.jobs].reverse().filter((job) => job.id !== current?.id),
    patient: open.patient_ref ?? open.study_id,
  }
}
