import { api } from '@/lib/api'
import type { IAnnotCase, IAnnotPolygon, IModelVersion, IQueueItem, ITrainTarget } from '@/types'

/* The annotation contour as it will be asked of the backend. Nothing of this
   is implemented on the server yet — the routes are listed in
   context/backend_requests.md and answered by the demo adapter meanwhile. */

export interface QueueAnswer {
  queue: IQueueItem[]
}

export interface TrainingAnswer {
  targets: ITrainTarget[]
  versions: IModelVersion[]
}

/* How the annotator let go of the frame. «Сомневаюсь» is not a violation and
   not a refusal: the frame goes to a second pair of eyes. */
export type AnnotOutcome = 'done' | 'doubt' | 'skip'

/* One point as the contract wants it back: the name it came under, whether
   the anatomy is in the frame at all, and where it ended up — in pixels of
   the original frame, the same system the prediction arrived in. */
export interface ISubmitPoint {
  name: string
  present: boolean
  x: number | null
  y: number | null
}

export interface SubmitData {
  key: string
  outcome: AnnotOutcome
  points?: ISubmitPoint[]
  polygons?: IAnnotPolygon[]
  /* what the annotator says is on the frame, for the foreign-object task */
  verdict?: string
  features?: string[]
  comment?: string
}

const ApiAnnotation = {
  async getQueue() {
    return await api.get<QueueAnswer>('/annotation/queue')
  },

  /* Whether to run the models is decided here, once, because it decides what
     the annotator sees on the desk afterwards. */
  async addToQueue(data: { count: number; pre: boolean; urgent: boolean }) {
    return await api.post<{ added: number }>('/annotation/queue', data)
  },

  async getCase(key: string) {
    return await api.get<{ case: IAnnotCase }>(`/annotation/case/${key}`)
  },

  async submit(data: SubmitData) {
    return await api.post('/annotation/submit', data)
  },

  async getTraining() {
    return await api.get<TrainingAnswer>('/annotation/training')
  },

  async startTraining(ids: string[]) {
    return await api.post('/annotation/training/start', { ids })
  },

  async switchVersions(ids: string[]) {
    return await api.post('/annotation/training/switch', { ids })
  },

}

export default ApiAnnotation
