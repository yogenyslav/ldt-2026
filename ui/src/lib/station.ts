import type { Intake } from '@/lib/cabinet'
import type { IJobInfo } from '@/types'

/* The visit the station is working on.

   A session is a list of attempts — the scans that came in while this station
   was waiting for one. It is kept by the station itself, not derived from the
   study of a scan: what makes two scans attempts of one patient is that the
   technologist asked for the second one, and nothing in the file says that.

   The station only listens while it is waiting: before the first scan of a
   visit and after "Переснять". As long as a scan is on the screen undecided,
   nothing can arrive and replace it — the person in front of the technologist
   is the one on the screen.

   A retake carries no decision with it. The decision is made once, at the end:
   one attempt is accepted and the rest of the session are rejected together. */

const KEY = 'dxa_qc_station'

/* A scan made just before the screen was opened still belongs to this room, so
   the station looks back a few minutes when it starts waiting. */
export const ARRIVAL_GRACE = 5 * 60_000

/* A visit nobody closed for this long is not the patient on the table any more. */
export const SESSION_WINDOW = 2 * 60 * 60 * 1000

export interface IStationSession {
  /* job ids, in arrival order */
  attempts: string[]
  /* true while the station expects a scan: the first one, or a retake */
  awaiting: boolean
  /* ms, since when an arriving scan counts as ours */
  since: number
  startedAt: number
}

export const newSession = (jobId: string, now = Date.now()): IStationSession => ({
  attempts: [jobId],
  awaiting: false,
  since: now,
  startedAt: now,
})

export const withAttempt = (session: IStationSession, jobId: string): IStationSession => ({
  ...session,
  attempts: session.attempts.includes(jobId) ? session.attempts : [...session.attempts, jobId],
  awaiting: false,
})

export const awaitingRetake = (session: IStationSession, now = Date.now()): IStationSession => ({
  ...session,
  awaiting: true,
  since: now,
})

export const isExpired = (session: IStationSession, now = Date.now()) =>
  now - session.startedAt > SESSION_WINDOW

/* Whether the station is listening at all. With a scan on the screen and no
   retake asked for, it is not: nothing may arrive and push the patient aside.
   Between visits it listens only if the room takes scans from the device —
   in manual mode nothing comes by itself. */
export const shouldListen = (session: IStationSession | null, intake: Intake) =>
  session ? session.awaiting : intake === 'device'

/* The scan that joins the session: the earliest one the station has not seen
   yet, no older than the moment it started waiting. */
export function arrival(
  jobs: IJobInfo[],
  seen: string[],
  since: number,
): IJobInfo | undefined {
  return [...jobs]
    .filter((job) => !seen.includes(job.id) && Date.parse(job.created_at) >= since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
}

export function readSession(): IStationSession | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as IStationSession
    if (!session.attempts?.length || isExpired(session)) return null
    return session
  } catch {
    return null
  }
}

export function writeSession(session: IStationSession | null) {
  try {
    if (session) window.localStorage.setItem(KEY, JSON.stringify(session))
    else window.localStorage.removeItem(KEY)
  } catch {
    /* a blocked storage must not break the station */
  }
}
