import { api } from '@/lib/api'
import type {
  IAnnotCase,
  IModelVersion,
  IParamSpec,
  IQueueItem,
  ITrainTarget,
  ITuneShot,
} from '@/types'

/* The annotation contour as it will be asked of the backend. Nothing of this
   is implemented on the server yet — the routes are listed in
   context/backend_requests.md and answered by the demo adapter meanwhile. */

export interface QueueAnswer {
  queue: IQueueItem[]
  /* how long the queue is per source: the page carries five frames, not sixty */
  total: { all: number; clinic: number; upload: number }
  tiles: Array<{ label: string; value: string; note: string; tone: string }>
}

export interface TrainingAnswer {
  targets: ITrainTarget[]
  versions: IModelVersion[]
}

/* How the annotator let go of the frame. «Сомневаюсь» is not a violation and
   not a refusal: the frame goes to a second pair of eyes. */
export type AnnotOutcome = 'done' | 'doubt' | 'skip'

export interface SubmitData {
  key: string
  outcome: AnnotOutcome
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

  async getParams() {
    return await api.get<{ params: IParamSpec[] }>('/annotation/params')
  },

  async getShots(id: string, source: string) {
    return await api.get<{ shots: ITuneShot[] }>(`/annotation/params/${id}/shots?source=${source}`)
  },

  async saveParam(id: string, cuts: number[]) {
    return await api.post(`/annotation/params/${id}`, { cuts })
  },
}

export default ApiAnnotation
