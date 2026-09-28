import { REGION_SHORT } from '@/constants'
import type { AnnotTask, IAnnotCase, IAnnotPoint, IAnnotPolygon, ICriterion, IJobInfo, Point, Region } from '@/types'

/* ============================================================
   The annotation queue, built out of what the service has already
   done: a task is a study the analyser was not sure about.

   Nothing here is a separate store. A frame is queued because its
   result says so — a criterion with no answer, a crest out of the
   frame, an object the model only suspects. The same result carries
   the prediction the annotator corrects, so the desk needs no second
   source either.

   Coordinates stay in pixels of the original frame all the way
   through, as dicom-analyzer/examples/annotation/README.md requires.
   ============================================================ */

/* Which criterion feeds which model, and therefore which task. */
const TASK_OF: Record<string, AnnotTask> = {
  hip_keypoints: 'hip_keypoints',
  pelvis_crest: 'pelvis_crest',
  foreign_objects: 'foreign_seg',
}

/* The points each task asks for, in the order the contract lists them. */
const POINTS_OF: Record<AnnotTask, Array<{ name: string; title: string }>> = {
  hip_keypoints: [
    { name: 'greater_trochanter_apex', title: 'Большой вертел' },
    { name: 'femoral_neck', title: 'Шейка бедра' },
    { name: 'ischium', title: 'Седалищная кость' },
  ],
  pelvis_crest: [
    { name: 'crest_left', title: 'Гребень слева' },
    { name: 'crest_right', title: 'Гребень справа' },
  ],
  foreign_seg: [],
}

/* ---------- where a point is allowed to go ----------
   The contract fixes these boxes: outside them the peak is forbidden by the
   architecture of the model, so annotation placed there simply would not be
   learned. The table is quoted for the two frame sizes this scanner produces;
   for anything else the box is unknown and the zone is not drawn.

   The boxes are given for hip_left. For hip_right they are mirrored
   horizontally, which the contract says the backend does — until it hands
   them over, the front mirrors them the same way. */
const ALLOWED_BOX: Record<number, Record<string, [number, number, number, number]>> = {
  263: {
    greater_trochanter_apex: [105, 36.2, 255, 183.8],
    femoral_neck: [57.5, 43.8, 210, 178.8],
    ischium: [0, 61.2, 140, 233.8],
  },
  235: {
    greater_trochanter_apex: [105, 22.5, 255, 170],
    femoral_neck: [57.5, 30, 210, 165],
    ischium: [0, 47.5, 140, 220],
  },
}

function boxFor(
  name: string,
  region: Region,
  rows: number,
  cols: number,
): [number, number, number, number] | null {
  const box = ALLOWED_BOX[rows]?.[name]
  if (!box) return null
  if (region !== 'hip_right') return box
  /* x → cols - 1 - x, so the two edges swap places */
  return [cols - 1 - box[2], box[1], cols - 1 - box[0], box[3]]
}

/* ---------- which studies are worth annotating ---------- */

const text = (criterion: ICriterion, key: string) => {
  const value = criterion.details?.[key]
  return typeof value === 'string' ? value : ''
}

const pointsOf = (criterion?: ICriterion) => Object.keys(criterion?.points ?? {}).length

/* Why this study is in the queue, said the way a doctor would say it. An empty
   answer means it is not. */
function reasonFor(key: string, criterion: ICriterion): string {
  if (key === 'hip_keypoints') {
    if (pointsOf(criterion) < 3) return 'модель нашла не все точки бедра'
    if (criterion.ok === null) return 'модель не смогла оценить точки'
    return ''
  }

  if (key === 'pelvis_crest') {
    if (criterion.ok === 0) return 'гребень не попал в кадр — нужна разметка границы'
    if (criterion.ok === null || pointsOf(criterion) < 2) return 'модель нашла не оба гребня'
    return ''
  }

  if (key === 'foreign_objects') {
    const verdict = text(criterion, 'verdict')
    if (verdict === 'проверить') return 'модель сомневается, есть ли предмет'
    if (verdict === 'ПРЕДМЕТ') return 'подтвердите найденный предмет и обведите его'
    return ''
  }

  return ''
}

export interface IAnnotTask {
  /* job id and task, which together open one frame */
  key: string
  jobId: string
  dicomId: string
  task: AnnotTask
  file: string
  region: Region
  rows: number
  cols: number
  why: string
  /* the model has already put something on this frame */
  pre: boolean
  created_at: string
}

export function annotTasks(jobs?: IJobInfo[]): IAnnotTask[] {
  const tasks: IAnnotTask[] = []

  for (const job of jobs ?? []) {
    const meta = job.metadata
    if (job.status !== 'completed') continue
    if (!meta?.criteria || !meta.shape || !job.anatomical_region) continue

    for (const key of Object.keys(meta.criteria)) {
      const task = TASK_OF[key]
      if (!task) continue

      const criterion = meta.criteria[key]
      const why = reasonFor(key, criterion)
      if (!why) continue

      tasks.push({
        key: `${job.id}:${task}`,
        jobId: job.id,
        dicomId: job.dicom_id,
        task,
        file: job.file_name ?? job.id,
        region: job.anatomical_region,
        rows: meta.shape[0],
        cols: meta.shape[1],
        why,
        pre: task === 'foreign_seg' ? !!criterion.regions?.length : pointsOf(criterion) > 0,
        created_at: job.created_at,
      })
    }
  }

  return tasks
}

/* ---------- the frame the desk opens ---------- */

const CRITERION_OF: Record<AnnotTask, string> = {
  hip_keypoints: 'hip_keypoints',
  pelvis_crest: 'pelvis_crest',
  foreign_seg: 'foreign_objects',
}

/* The prediction to correct, laid out the way the contract lays out a task.
   `png` is filled in by the screen once the scan itself has been fetched. */
export function caseOf(job: IJobInfo, task: AnnotTask, png: string): IAnnotCase | null {
  const meta = job.metadata
  if (!meta?.shape || !job.anatomical_region) return null

  const criterion = meta.criteria?.[CRITERION_OF[task]]
  const [rows, cols] = meta.shape
  const region = job.anatomical_region

  const items: IAnnotPoint[] = POINTS_OF[task].map(({ name, title }) => {
    const at = criterion?.points?.[name] as Point | undefined
    return {
      name,
      title,
      allowed_box: boxFor(name, region, rows, cols) ?? undefined,
      /* the model's guess, already in frame pixels; `reviewed` stays false —
         a point nobody touched is of no use for training (origin: model) */
      prefill: at ? { x: at[0], y: at[1], present: true, confidence: 1 } : null,
    }
  })

  const polygons: IAnnotPolygon[] | undefined =
    task === 'foreign_seg'
      ? (criterion?.regions ?? []).map((region) => ({ cls: 'wire' as const, points: region }))
      : undefined

  return {
    key: `${job.id}:${task}`,
    task,
    file: job.file_name ?? job.id,
    region,
    rows,
    cols,
    png,
    items: task === 'foreign_seg' ? undefined : items,
    polygons,
    verdict: task === 'foreign_seg' ? text(criterion ?? ({} as ICriterion), 'verdict') : undefined,
    blank: task === 'foreign_seg' ? !polygons?.length : items.every((item) => !item.prefill),
  }
}

/* A frame this size has no documented zones, so the screen says so instead of
   drawing a box around the whole picture. */
export function hasZones(rows: number): boolean {
  return !!ALLOWED_BOX[rows]
}

/* Keeping the point inside its zone is part of the contract: outside it the
   annotation would not be learned. */
export function clampToBox(
  box: [number, number, number, number],
  x: number,
  y: number,
): Point {
  return [Math.min(Math.max(x, box[0]), box[2]), Math.min(Math.max(y, box[1]), box[3])]
}

export const regionName = (region: Region) => REGION_SHORT[region]
