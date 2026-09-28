import { api } from '@/lib/api'
import type { AnnotTask, IModelVersion, ITrainTarget, Point, Region } from '@/types'

/* ============================================================
   Приём разметки и состояние дообучения.

   The submission follows dicom-analyzer/examples/annotation/README.md
   to the letter: one JSON per frame, coordinates in pixels of the
   original frame, every point carrying how it got there. A submission
   is immutable — a correction is a new one with `supersedes`.

   Neither of these routes exists on the server yet. They are listed
   in context/back_annotations.md; until they are there the call fails
   and the screen says so, which is the truth.
   ============================================================ */

export const SCHEMA_VERSION = '1.0'

/* `done` — размечено полностью, `uncertain` — размечено, но разметчик не
   уверен (нужен комментарий), `skipped` — не смог (нужен комментарий). */
export type SubmissionStatus = 'done' | 'uncertain' | 'skipped'

/* Whether the point got where it is by itself. Only `human` and
   `model_confirmed` are worth training on: `model` would be the model
   learning from itself. */
export type PointOrigin = 'model' | 'model_confirmed' | 'human'

export interface ISubmitPoint {
  name: string
  /* the anatomy is visible in the frame at all — not «я её нашёл» */
  present: boolean
  /* only when present; otherwise no coordinates at all */
  x: number | null
  y: number | null
  origin: PointOrigin
}

export interface ISubmitPolygon {
  cls: 'wire' | 'object'
  points: Point[]
}

export interface ISubmission {
  schema_version: string
  submission_id: string
  task_id: string
  job_id: string
  image: { rows: number; cols: number; region: Region | null }
  created_at: string
  duration_ms: number
  /* wrong_region | implant | bad_image | other */
  image_flags: string[]
  status: SubmissionStatus
  comment: string
  annotations: Partial<
    Record<
      AnnotTask,
      { points?: ISubmitPoint[]; polygons?: ISubmitPolygon[]; verdict?: string }
    >
  >
  supersedes: string | null
}

export interface TrainingAnswer {
  targets: ITrainTarget[]
  versions: IModelVersion[]
}

/* A submission as it comes back: the whole thing, so an annotation can be
   opened and corrected without a second request. */
export interface ISubmissionRecord extends ISubmission {
  annotator?: { id: string; role: string }
  /* set on the older submission once a correction supersedes it */
  superseded_by?: string | null
}

const ApiAnnotation = {
  async submit(submission: ISubmission) {
    return await api.post<{ warnings?: Array<{ code: string; item: string }> }>(
      '/annotation/submission',
      submission,
    )
  },

  /* What has already been annotated: it leaves the queue of work and joins the
     list that can be corrected. Only the latest submission per frame is
     returned — the ones it supersedes stay in history. */
  async listSubmissions(limit = 50, offset = 0) {
    return await api.get<{ submissions: ISubmissionRecord[] }>(
      `/annotation/submissions?limit=${limit}&offset=${offset}`,
    )
  },

  async getTraining() {
    return await api.get<TrainingAnswer>('/annotation/training')
  },

  async startTraining(models: string[]) {
    return await api.post('/annotation/training/start', { models })
  },

  async switchVersions(models: string[]) {
    return await api.post('/annotation/training/switch', { models })
  },
}

export default ApiAnnotation
