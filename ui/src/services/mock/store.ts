import { DEMO_JOBS } from '@/services/mock/demoJobs'
import type { Decision, IJobInfo, IReport, JobStatus, Region } from '@/types'

/* Demo mode keeps state instead of returning canned answers: an uploaded file
   really becomes a job, and the job really goes through pending → processing →
   completed. Only the QC result is borrowed from a DEMO_JOBS template — the
   mock does not look at pixels, that is what the ML service is for.

   Lives here so that mockAdapter.ts stays a thin routing table. */

const KEY = 'dxa_qc_mock_v1'

/* How long a job spends in each stage. The status is derived from the age of
   the job on every read, so no timers and no scheduler are needed. */
const PENDING_MS = 1_200
const PROCESSING_MS = 4_000

interface MockJob {
  id: string
  /* id of the DEMO_JOBS entry that supplies the QC result */
  template: string
  created_at: string
  file_name: string
  source: 'device' | 'upload'
  study_id: string
  patient_ref: string
  decision?: Decision
  comment?: string
  specialist_name?: string
}

interface MockState {
  jobs: MockJob[]
  reports: IReport[]
  counter: number
}

/* Templates: everything the ML service has already chewed through once. */
const TEMPLATES = DEMO_JOBS.filter((job) => job.status === 'completed' || job.status === 'failed')

const REGIONS: Region[] = ['spine', 'hip_left', 'hip_right']

/* Region guessed from the file name the way the real classifier guesses it
   from the image. The Cyrillic short names are the ones the test archive uses. */
const HINTS: Array<[RegExp, Region]> = [
  [/ЛПОБ|hip[-_]?l|left/i, 'hip_left'],
  [/ППОБ|hip[-_]?r|right/i, 'hip_right'],
  [/ПОП|spine|lumbar/i, 'spine'],
]

/* The backend sends clinic-local time without a zone; keep the same shape, so
   that the age of a job can be read back out of the string. */
const stamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

const hex = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')

/* Scans of one visit share the prefix of their file name: CR000000_ПОП.dcm and
   CR000000_ППОБ.dcm are the same patient. StudyInstanceUID is derived from that
   prefix, so the queue groups them into one visit with no extra bookkeeping. */
const keyOf = (fileName: string) => fileName.split(/[._]/)[0] || 'scan'

const studyOf = (key: string) => {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 100_000
  return `1.2.643.5.1.13.2026.${String(hash).padStart(5, '0')}`
}

const empty = (): MockState => ({ jobs: [], reports: [], counter: 0 })

function load(): MockState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return empty()
    return { ...empty(), ...(JSON.parse(raw) as MockState) }
  } catch {
    return empty()
  }
}

let state = load()

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* full or blocked storage must not break the interface */
  }
}

function templateFor(region: Region, index: number) {
  const list = TEMPLATES.filter((job) => job.anatomical_region === region)
  const pool = list.length ? list : TEMPLATES
  return pool[index % pool.length]
}

/* One job as the backend would return it: the stage comes from the clock, the
   result from the template, the decision from what the specialist has done. */
function project(job: MockJob): IJobInfo {
  const template = TEMPLATES.find((item) => item.id === job.template) ?? TEMPLATES[0]
  const age = Date.now() - Date.parse(job.created_at)
  const stage: JobStatus =
    age < PENDING_MS ? 'pending' : age < PROCESSING_MS ? 'processing' : template.status

  const head = {
    id: job.id,
    dicom_id: template.dicom_id,
    file_name: job.file_name,
    study_id: job.study_id,
    patient_ref: job.patient_ref,
    created_at: job.created_at,
  }

  if (stage === 'pending' || stage === 'processing') {
    return {
      ...head,
      status: stage,
      anatomical_region: null,
      confidence: null,
      violations: [],
      metadata: { study_id: job.study_id, patient_ref: job.patient_ref },
    }
  }

  return {
    ...template,
    ...head,
    status: stage,
    updated_at: job.created_at,
    metadata: {
      ...template.metadata,
      study_id: job.study_id,
      patient_ref: job.patient_ref,
      device: 'GE Lunar Prodigy Advance',
    },
    specialist_decision: job.decision ?? null,
    comment: job.comment ?? '',
    specialist_name: job.specialist_name,
  }
}

/* Shared by an upload and by an "arrival" from the densitometer: both end up as
   one job, they differ only in where the file came from. */
function createJob(fileName: string, source: 'device' | 'upload') {
  const hinted = HINTS.find(([pattern]) => pattern.test(fileName))?.[1]
  const region = hinted ?? REGIONS[state.counter % REGIONS.length]
  const template = templateFor(region, state.counter)
  const key = keyOf(fileName)

  const job: MockJob = {
    id: hex(8),
    template: template.id,
    created_at: stamp(),
    file_name: fileName,
    source,
    study_id: studyOf(key),
    patient_ref: key,
  }

  state.jobs = [job, ...state.jobs]
  state.counter += 1
  save()
  return { job_id: job.id, dicom_id: template.dicom_id }
}

const SHORT: Record<Region, string> = {
  spine: 'ПОП',
  hip_left: 'ЛПОБ',
  hip_right: 'ППОБ',
}

const store = {
  /* newest first — the order the queue asks for */
  jobs(): IJobInfo[] {
    return [...state.jobs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(project)
  },

  job(id: string): IJobInfo | undefined {
    const found = state.jobs.find((item) => item.id === id)
    return found ? project(found) : undefined
  },

  /* An upload: the file name decides the region and the visit, the template
     decides what the analyser is going to "find". */
  create(fileName: string, source: 'device' | 'upload' = 'upload') {
    return createJob(fileName, source)
  },

  /* What the densitometer does by itself: sends a study to the PACS, and a job
     shows up in the queue that this interface did not create. Demo only — the
     setup check on the station uses it to exercise the device mode. */
  arrive() {
    const region = REGIONS[state.counter % REGIONS.length]
    const key = `CR${String(1000 + state.counter).padStart(6, '0')}`
    return createJob(`${key}_${SHORT[region]}.dcm`, 'device')
  },

  decide(jobIds: string[], decision: Decision, comment: string, specialist: string) {
    for (const job of state.jobs) {
      if (!jobIds.includes(job.id)) continue
      job.decision = decision
      job.comment = comment
      job.specialist_name = specialist
    }
    save()
  },

  reports(): IReport[] {
    return [...state.reports].sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  report(id: number) {
    return state.reports.find((item) => item.id === id)
  },

  addReport(downloadUrl: string) {
    const id = state.reports.reduce((max, item) => Math.max(max, item.id), 0) + 1
    state.reports = [{ id, created_at: stamp(), download_url: downloadUrl }, ...state.reports]
    save()
    return id
  },

  /* Service screen: fill a fresh installation with demo data, or wipe it. */
  seed() {
    state = empty()
    for (const template of DEMO_JOBS) {
      const region = template.anatomical_region ?? 'spine'
      const key = template.patient_ref ?? `P-${template.id}`
      state.jobs.push({
        id: template.id,
        template: template.id,
        created_at: template.created_at,
        file_name: `${key}_${SHORT[region]}.dcm`,
        source: 'device',
        study_id: template.study_id ?? studyOf(key),
        patient_ref: key,
        decision: template.specialist_decision ?? undefined,
        comment: template.comment,
        specialist_name: template.specialist_name,
      })
    }
    state.counter = state.jobs.length
    save()
  },

  reset() {
    state = empty()
    save()
  },
}

export default store
