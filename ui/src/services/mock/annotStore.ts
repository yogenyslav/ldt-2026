import { ANNOT_CASES } from '@/services/mock/annotCases'
import type { IAnnotCase, IModelVersion, IQueueItem, ITrainTarget } from '@/types'

/* ============================================================
   Demo state of the annotation contour, built the same way as
   services/mock/store.ts: the state is kept, not canned. A frame
   that has been sent leaves the queue, a chosen boundary stays
   chosen, a model that was sent to training keeps training —
   and a reload loses none of it.

   The frames, the predictions and the measured distances are real
   model output (annotCases.ts). What the backend has
   no place for yet — how many frames are collected, what a new
   version scores — is kept here and listed in
   context/backend_requests.md.
   ============================================================ */

const KEY = 'dxa_qc_annot_v1'

/* Two ways into the queue. The stream from the clinics has always been through
   the analyser: of those frames only the doubtful ones are queued. Uploaded
   frames arrive either way, depending on the choice made on upload. */
const SEED_QUEUE: Array<Omit<IQueueItem, 'file' | 'region' | 'rows' | 'cols' | 'png'>> = [
  {
    key: 'spine_foreign',
    task: 'foreign_seg',
    source: 'clinic',
    from: 'ГП 180, филиал 2',
    pre: true,
    why: 'вердикт против метки о предмете',
    confidence: 0.58,
    priority: 1,
  },
  {
    key: 'hip_left',
    task: 'hip_keypoints',
    source: 'clinic',
    from: 'ГП 68',
    pre: true,
    why: 'модель сомневается, есть ли точка на снимке',
    confidence: 0.34,
    priority: 1,
  },
  {
    key: 'spine_bad',
    task: 'pelvis_crest',
    source: 'upload',
    from: 'архив 2024, 40 снимков',
    pre: true,
    why: 'гребень слева не найден',
    confidence: 0.41,
    priority: 2,
  },
  {
    key: 'hip_right',
    task: 'hip_keypoints',
    source: 'upload',
    from: 'отбор негативов, 12 снимков',
    pre: false,
    why: 'загружено без моделей',
    confidence: null,
    priority: 2,
  },
  {
    key: 'spine_ok',
    task: 'pelvis_crest',
    source: 'clinic',
    from: 'ГП 180, филиал 2',
    pre: true,
    why: 'контроль: второй разметчик',
    confidence: 0.96,
    priority: 3,
  },
]

/* The four models are independent: each is trained on its own answers and each
   is switched over on its own. */
const SEED_TARGETS: ITrainTarget[] = [
  {
    id: 'hip_keypoints',
    name: 'Точки на бедре',
    have: 96,
    need: 250,
    hard: 'снимков с обрезанной анатомией: 7 из 60',
    ready: false,
    busy: false,
  },
  {
    id: 'pelvis_crest',
    name: 'Гребни таза',
    have: 248,
    need: 250,
    hard: 'снимков, где гребень не попал в кадр: 38 из 40',
    ready: true,
    busy: false,
  },
  {
    id: 'foreign_seg',
    name: 'Посторонние предметы',
    have: 121,
    need: 120,
    hard: 'чистых снимков для сравнения: 61 из 60',
    ready: true,
    busy: true,
    done: 0.34,
    left_minutes: 22,
  },
]

/* Numbers a radiologist can argue with: agreement with the doctor on frames
   held back from training, how often the violation is caught, how often a
   correct frame is flagged, how far the point lands from the mark.

   Each number carries the direction it should move, so the difference column
   is arithmetic — see lib/tune.ts. The vertical pixel of this scanner is
   1.05 mm, so a miss is shown in millimetres. */
const SEED_VERSIONS: IModelVersion[] = [
  {
    id: 'pelvis_crest',
    name: 'Гребни таза',
    trained: '28 сентября',
    checked: 40,
    metrics: [
      { name: 'Доля верных решений', unit: '%', goal: 'up', now: 86, next: 93 },
      { name: 'Находит нарушение укладки', unit: '%', goal: 'up', now: 71, next: 88 },
      { name: 'Тревога на корректном снимке', unit: '%', goal: 'down', now: 4, next: 5 },
      { name: 'Средний промах точки', unit: 'мм', goal: 'down', now: 22, next: 13 },
    ],
  },
  {
    id: 'foreign_seg',
    name: 'Посторонние предметы',
    trained: '26 сентября',
    checked: 40,
    metrics: [
      { name: 'Доля верных решений', unit: '%', goal: 'up', now: 79, next: 84 },
      { name: 'Находит предмет', unit: '%', goal: 'up', now: 6, next: 59 },
      { name: 'Тревога на чистом снимке', unit: '%', goal: 'down', now: 3, next: 12 },
    ],
  },
]

interface AnnotState {
  /* frames the annotator is done with: sent, doubted or skipped */
  done: string[]
  /* frames added through the upload sheet, and whether they came pre-annotated */
  added: Array<{ count: number; pre: boolean }>
  /* models sent to training from this screen */
  training: string[]
  /* versions that were switched over */
  switched: string[]
}

const empty = (): AnnotState => ({ done: [], added: [], training: [], switched: [] })

function load(): AnnotState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return empty()
    return { ...empty(), ...(JSON.parse(raw) as AnnotState) }
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

const byKey = new Map(ANNOT_CASES.map((item) => [item.key, item]))

const annotStore = {
  /* The queue as the doctor sees it: every line carries its own frame, and
     what has been sent is gone from the list. */
  queue(): IQueueItem[] {
    return SEED_QUEUE.filter((item) => !state.done.includes(item.key))
      .map((item) => {
        const frame = byKey.get(item.key)
        if (!frame) return null
        const { file, region, rows, cols, png } = frame
        return { ...item, file, region, rows, cols, png }
      })
      .filter((item): item is IQueueItem => item !== null)
  },

  case(key: string): IAnnotCase | undefined {
    return byKey.get(key)
  },

  /* A frame leaves the queue whichever way the annotator let go of it: sent,
     doubted or skipped. */
  finish(key: string) {
    if (!state.done.includes(key)) state.done.push(key)
    save()
  },

  add(count: number, pre: boolean) {
    state.added.push({ count, pre })
    save()
    return { added: count }
  },

  targets(): ITrainTarget[] {
    return SEED_TARGETS.map((target) => ({
      ...target,
      busy: target.busy || state.training.includes(target.id),
    }))
  },

  /* A version that has been switched over is no longer new. */
  versions(): IModelVersion[] {
    return SEED_VERSIONS.filter((version) => !state.switched.includes(version.id))
  },

  train(ids: string[]) {
    for (const id of ids) if (!state.training.includes(id)) state.training.push(id)
    save()
  },

  switchOver(ids: string[]) {
    for (const id of ids) if (!state.switched.includes(id)) state.switched.push(id)
    save()
  },

  reset() {
    state = empty()
    save()
  },
}

export default annotStore
