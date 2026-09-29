import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCabinet } from '@/context/CabinetContext'
import { useDecideJob, useLatestJobs } from '@/hooks/useJobs'
import { useEnrichedJobs } from '@/hooks/useDicomInfo'
import {
  ARRIVAL_GRACE,
  arrival,
  awaitingRetake,
  newSession,
  readSession,
  shouldListen,
  withAttempt,
  writeSession,
  type IStationSession,
} from '@/lib/station'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

/* The session of the station, shared by the screen and by the header: the
   header has to know whether it may let the technologist leave. */

interface IStationContext {
  /* attempts of the visit, in arrival order */
  attempts: IJobInfo[]
  /* the attempt the screen works with — the last one that came in */
  current?: IJobInfo
  awaiting: boolean
  patient: string
  /* at least one attempt has been analysed and nothing is accepted yet */
  open: boolean
  /* the station expects a scan and is listening for it */
  retake: () => void
  /* upload mode: the file has been sent, this is the job it became */
  attach: (jobId: string) => void
  accept: (job: IJobInfo) => Promise<void>
  dismiss: () => Promise<void>
}

const StationContext = createContext<IStationContext | undefined>(undefined)

const isBusy = (job: IJobInfo) => job.status === 'pending' || job.status === 'processing'
const isAnalysed = (job: IJobInfo) => job.status === 'completed' || job.status === 'failed'

const StationProvider = ({ children }: { children: ReactNode }) => {
  const { cabinet } = useCabinet()
  const decide = useDecideJob()

  const [session, setSession] = useState<IStationSession | null>(readSession)
  /* when the station started waiting for the first scan of the next visit */
  const idleSince = useRef(Date.now() - ARRIVAL_GRACE)

  const save = useCallback((next: IStationSession | null) => {
    writeSession(next)
    setSession(next)
  }, [])

  /* Listening happens only while a scan is expected — see shouldListen. */
  const watching = shouldListen(session, cabinet.intake)
  const { data: jobs } = useLatestJobs(watching)

  const rawAttempts = useMemo(() => {
    if (!session || !jobs) return []
    return session.attempts
      .map((id) => jobs.find((job) => job.id === id))
      .filter((job): job is IJobInfo => !!job)
  }, [session, jobs])

  const { jobs: enrichedAttempts } = useEnrichedJobs(rawAttempts)
  const attempts = enrichedAttempts ?? []

  /* A second observer of the same query: it adds no request of its own, it only
     keeps the polling on while an attempt of ours is still being processed. */
  useLatestJobs(watching || attempts.some(isBusy))

  /* A scan that arrives while the station is waiting joins the visit. */
  useEffect(() => {
    if (!jobs || !watching) return
    const since = session?.since ?? idleSince.current
    const fresh = arrival(jobs, session?.attempts ?? [], since)
    if (!fresh) return
    save(session ? withAttempt(session, fresh.id) : newSession(fresh.id))
  }, [jobs, watching, session, save])

  const close = useCallback(() => {
    idleSince.current = Date.now()
    save(null)
  }, [save])

  const retake = useCallback(() => {
    if (!session) return
    save(awaitingRetake(session))
  }, [session, save])

  const attach = useCallback(
    (jobId: string) => {
      save(session ? withAttempt(session, jobId) : newSession(jobId))
    },
    [session, save],
  )

  /* One decision closes the visit: the chosen attempt is accepted, everything
     else shot for this patient is rejected in the same breath. */
  const accept = useCallback(
    async (job: IJobInfo) => {
      const level = verdictOf(job)
      const decision = level === 'bad' || level === 'failed' ? 'force_approved' : 'approved'
      const others = attempts.filter((item) => item.id !== job.id).map((item) => item.id)

      await decide.mutateAsync({ jobIds: [job.id], decision })
      if (others.length) await decide.mutateAsync({ jobIds: others, decision: 'rejected' })
      close()
    },
    [attempts, decide, close],
  )

  /* Nothing worked out: every attempt is closed as rejected. */
  const dismiss = useCallback(async () => {
    const ids = attempts.map((item) => item.id)
    if (ids.length) await decide.mutateAsync({ jobIds: ids, decision: 'rejected' })
    close()
  }, [attempts, decide, close])

  const value = useMemo<IStationContext>(
    () => ({
      attempts,
      current: attempts[attempts.length - 1],
      awaiting: !!session?.awaiting,
      patient: attempts.find((attempt) => attempt.patient_ref)?.patient_ref ?? '',
      open: attempts.some(isAnalysed),
      retake,
      attach,
      accept,
      dismiss,
    }),
    [attempts, session, retake, attach, accept, dismiss],
  )

  return <StationContext.Provider value={value}>{children}</StationContext.Provider>
}

export default StationProvider

export const useStation = () => {
  const context = useContext(StationContext)
  if (!context) throw new Error('useStation должен вызываться внутри StationProvider')
  return context
}
