import { ANNOT_CASES } from '@/services/mock/annotCases'
import { TUNE_FRAMES } from '@/services/mock/tuneFrames'
import type {
  IAnnotCase,
  IModelVersion,
  IParamSpec,
  IQueueItem,
  ITrainTarget,
  ITuneShot,
  Point,
} from '@/types'

/* ============================================================
   Demo state of the annotation contour, built the same way as
   services/mock/store.ts: the state is kept, not canned. A frame
   that has been sent leaves the queue, a chosen boundary stays
   chosen, a model that was sent to training keeps training —
   and a reload loses none of it.

   The frames, the predictions and the measured distances are real
   model output (annotCases.ts, tuneFrames.ts). What the backend has
   no place for yet — how many frames are collected, what a new
   version scores — is kept here and listed in
   context/backend_requests.md.
   ============================================================ */

const KEY = 'dxa_qc_annot_v1'

/* Two ways into the queue. The stream from the clinics has always been through
   the analyser: of those frames only the doubtful ones are queued. Uploaded
   frames arrive either way, depending on the choice made on upload. */
const SEED_QUEUE: IQueueItem[] = [
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

/* How long the queue really is. The demo holds five frames; the rest of the
   queue is counted, not carried. */
const QUEUE_TOTAL = { all: 63, clinic: 41, upload: 22 }

/* The four models are independent: each is trained on its own answers and each
   is switched over on its own. */
const SEED_TARGETS: ITrainTarget[] = [
  {
    id: 'hip',
    name: 'Точки на бедре',
    have: 96,
    need: 250,
    hard: 'снимков с обрезанной анатомией: 7 из 60',
    ready: false,
    busy: false,
  },
  {
    id: 'crest',
    name: 'Гребни таза',
    have: 248,
    need: 250,
    hard: 'снимков, где гребень не попал в кадр: 38 из 40',
    ready: true,
    busy: false,
  },
  {
    id: 'foreign',
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
    id: 'crest',
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
    id: 'foreign',
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

/* What the analyser measures and where the boundaries sit right now. The
   boundaries are not trained, they are chosen — that is the whole screen. */
const SEED_PARAMS: IParamSpec[] = [
  {
    id: 'rotation',
    title: 'Ротация бедра',
    question: 'На сколько миллиметров малый вертел выступает за край кости',
    how:
      'Чем меньше выступает малый вертел, тем сильнее бедро завёрнуто внутрь; ' +
      'чем сильнее выступает — тем больше развёрнуто наружу.',
    unit: 'мм',
    min: 0,
    max: 8,
    step: 0.1,
    /* нарушение · сомнение · норма · сомнение · нарушение */
    cuts: [0.2, 1, 4.4, 5.2],
    bands: ['viol', 'warn', 'norm', 'warn', 'viol'],
  },
  {
    id: 'crest',
    title: 'Гребень таза',
    question: 'Насколько уверенно должен быть виден гребень, чтобы считать его найденным',
    how: 'Гребень ищется в нижних углах кадра — они выделены на снимках.',
    unit: '%',
    min: 50,
    max: 100,
    step: 1,
    cuts: [70],
    bands: ['viol', 'norm'],
  },
]

/* The crest set is synthetic: the frames are real, the numbers on them are
   made up, because no export of this measurement exists yet
   (context/retro/2026-09-28-annotation.md). */
const CREST_SET: Array<[string, number]> = [
  ['spine_ok', 95],
  ['spine_bad', 62],
  ['spine_ok', 88],
  ['spine_bad', 54],
  ['spine_ok', 97],
  ['spine_ok', 68],
  ['spine_bad', 58],
  ['spine_ok', 92],
  ['spine_bad', 66],
  ['spine_ok', 99],
  ['spine_ok', 75],
  ['spine_bad', 51],
  ['spine_ok', 84],
  ['spine_bad', 69],
  ['spine_ok', 93],
  ['spine_bad', 60],
]

interface AnnotState {
  /* frames the annotator is done with: sent, doubted or skipped */
  done: string[]
  /* frames added through the upload sheet, and whether they came pre-annotated */
  added: Array<{ count: number; pre: boolean }>
  /* boundaries as they were last saved */
  cuts: Record<string, number[]>
  /* models sent to training from this screen */
  training: string[]
  /* versions that were switched over */
  switched: string[]
}

const empty = (): AnnotState => ({ done: [], added: [], cuts: {}, training: [], switched: [] })

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

const rect = (x: number, y: number, width: number, height: number): Point[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height],
]

/* The windows the crest is looked for in: the lower corners of the frame. */
function crestWindows(item: IAnnotCase): Point[][] {
  const top = Math.floor(0.667 * item.rows)
  const width = Math.floor(0.36 * item.cols)
  return [
    rect(0, top, width, item.rows - top),
    rect(item.cols - width, top, width, item.rows - top),
  ]
}

const annotStore = {
  /* The queue as the doctor sees it: what has been sent is gone from it. */
  queue(): IQueueItem[] {
    return SEED_QUEUE.filter((item) => !state.done.includes(item.key))
  },

  /* How long the queue is in total, per source. Everything already sent from
     this workstation comes off the count. */
  total(): typeof QUEUE_TOTAL {
    const gone = (source: 'clinic' | 'upload') =>
      SEED_QUEUE.filter((item) => state.done.includes(item.key) && item.source === source).length
    const added = state.added.reduce((sum, batch) => sum + batch.count, 0)
    return {
      all: QUEUE_TOTAL.all - gone('clinic') - gone('upload') + added,
      clinic: QUEUE_TOTAL.clinic - gone('clinic'),
      upload: QUEUE_TOTAL.upload - gone('upload') + added,
    }
  },

  /* What the four tasks are short of — the reason a frame is queued at all. */
  tiles() {
    return [
      { label: 'Задача 5 · предмет', value: '19', note: 'позитивов в обучении', tone: 'bad' },
      {
        label: 'Задача 2 · негативы',
        value: '7',
        note: 'снимков с обрезанной анатомией',
        tone: 'bad',
      },
      { label: 'Задача 3 · ошибка точки', value: '21 px', note: 'в среднем против разметки', tone: 'warn' },
      { label: 'Задача 4 · метки', value: '88', note: 'окон размечено', tone: 'ok' },
    ]
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

  params(): IParamSpec[] {
    return SEED_PARAMS.map((param) => ({ ...param, cuts: state.cuts[param.id] ?? param.cuts }))
  },

  saveCuts(id: string, cuts: number[]) {
    state.cuts[id] = cuts
    save()
  },

  /* The grid of frames for one parameter. The demo holds one exported set, so
     both sources answer with it; the real service picks the latest frames. */
  shots(id: string): ITuneShot[] {
    if (id === 'rotation') {
      return TUNE_FRAMES.map((frame) => ({
        key: frame.key,
        png: frame.png,
        cols: frame.cols,
        rows: frame.rows,
        shapes: frame.bump,
        value: frame.dist_mm,
      }))
    }

    return CREST_SET.map(([key, value], index) => {
      const item = byKey.get(key)
      if (!item) return null
      return {
        key: `${key}-${index}`,
        png: item.png,
        cols: item.cols,
        rows: item.rows,
        shapes: crestWindows(item),
        value,
      }
    }).filter((shot): shot is ITuneShot => shot !== null)
  },

  reset() {
    state = empty()
    save()
  },
}

export default annotStore
