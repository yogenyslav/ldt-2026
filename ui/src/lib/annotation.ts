import type {
  AnnotSource,
  IAnnotCase,
  IAnnotPolygon,
  IQueueItem,
  Point,
  PointState,
} from '@/types'

/* ============================================================
   Annotation desk logic, kept apart from the components so that it
   can be run without a browser (see context/retro/2026-09-28-annotation.md).

   The screen is a conveyor, not a form: one point is in hand at a
   time, and everything the panel says about the frame — what is
   left, which region is lit, which marker is drawn — comes from
   the state of that one point.
   ============================================================ */

/* Above this much confidence a "not present" answer still carries a guess
   worth looking at; below it the model is sure the anatomy is out of frame. */
const GUESS_CONFIDENCE = 0.5

/* Marker and badge must never disagree: if the model doubts itself the marker
   is drawn and the point reads «проверьте»; if it is sure the anatomy is not
   in the frame, there is no marker at all. */
export function pointState(item: IAnnotCase, index: number): PointState {
  const point = item.items?.[index]
  if (!point) return 'empty'
  /* what the annotator answered outranks what the model suggested */
  if (point.answer === 'absent') return 'absent'
  if (point.answer === 'confirmed') return 'checked'
  if (item.blank) return 'empty'
  if (!point.prefill) return 'empty'
  if (!point.prefill.present) {
    return point.prefill.confidence >= GUESS_CONFIDENCE ? 'suggested' : 'absent'
  }
  return point.reviewed ? 'checked' : 'suggested'
}

export function pointStates(item: IAnnotCase): PointState[] {
  return (item.items ?? []).map((_, index) => pointState(item, index))
}

/* The conveyor always has one point in hand: the first that still needs
   attention, or the last one when everything is done. */
export function activeIndex(item: IAnnotCase): number {
  if (!item.items?.length) return -1
  for (let index = 0; index < item.items.length; index += 1) {
    const state = pointState(item, index)
    if (state === 'suggested' || state === 'empty') return index
  }
  return item.items.length - 1
}

/* How much of the frame is still unanswered. A frame with no points at all is
   the foreign-object task: nothing is drawn on a blank one yet. */
export function leftToMark(item: IAnnotCase): number {
  if (!item.items?.length) return item.blank ? 1 : 0
  return pointStates(item).filter((state) => state === 'suggested' || state === 'empty').length
}

/* A frame that arrived without a prefill: the zones and the rules are there,
   nothing else. Nothing is mutated — the case itself is shared data. */
export function blankCase(item: IAnnotCase): IAnnotCase {
  return {
    ...item,
    blank: true,
    items: item.items?.map((point) => ({ ...point, prefill: null, reviewed: false, answer: undefined })),
    polygons: item.polygons ? [] : undefined,
    verdict: undefined,
  }
}

/* The filter chosen in the queue travels to the desk: «следующий» walks the
   queue the doctor is actually in, and the counter counts the same list. */
export function queueOf(queue: IQueueItem[], source: AnnotSource | 'all'): IQueueItem[] {
  return source === 'all' ? queue : queue.filter((item) => item.source === source)
}

export function queueKeys(queue: IQueueItem[], source: AnnotSource | 'all'): string[] {
  return queueOf(queue, source).map((item) => item.key)
}

/* Position inside that filtered queue, as the panel prints it. The second
   number is the queue itself — counting frames the page has not been given
   is how «1 из 59» ended up above a queue of five. */
export function placeInQueue(keys: string[], current: string): string {
  const index = keys.indexOf(current)
  if (index < 0) return ''
  return `${index + 1} из ${keys.length}`
}

/* Which frame the desk shows next after the current one is sent. */
export function nextKey(keys: string[], current: string): string | null {
  const index = keys.indexOf(current)
  if (index < 0) return keys[0] ?? null
  return keys[index + 1] ?? null
}

/* ---------- what the annotator does to the frame ----------
   The edits are kept apart from the frame: the exported case is shared data
   and is never touched. The frame the screen draws is the two put together,
   so undoing an edit really returns the point to what the model had said. */

export interface IPointEdit {
  /* where the annotator put the point, in frame pixels */
  x?: number
  y?: number
  /* the anatomy is cut off by the frame edge — there is nothing to put */
  absent?: boolean
}

export type PointEdits = Record<number, IPointEdit>

/* Placing a point clears «нет на снимке»: the two answers contradict. */
export function placePoint(edits: PointEdits, index: number, x: number, y: number): PointEdits {
  return { ...edits, [index]: { x, y } }
}

/* Said twice, it is taken back: the point returns to the model's guess. */
export function toggleAbsent(edits: PointEdits, index: number): PointEdits {
  const next = { ...edits }
  if (next[index]?.absent) delete next[index]
  else next[index] = { absent: true }
  return next
}

/* Confirming the model's guess is the same as putting the point where the
   model put it — after that it is the annotator's point. */
export function confirmPoint(item: IAnnotCase, edits: PointEdits, index: number): PointEdits {
  const guess = item.items?.[index]?.prefill
  if (!guess) return edits
  return placePoint(edits, index, guess.x, guess.y)
}

export function clearPoint(edits: PointEdits, index: number): PointEdits {
  const next = { ...edits }
  delete next[index]
  return next
}

/* The frame as it stands right now: the model's guesses with the annotator's
   work on top. A placed point is settled — it is the answer, not a guess. */
export function withEdits(
  item: IAnnotCase,
  edits: PointEdits,
  polygons?: IAnnotPolygon[],
): IAnnotCase {
  const next: IAnnotCase = { ...item }
  if (polygons) next.polygons = polygons
  if (!item.items) return next

  next.items = item.items.map((point, index) => {
    const edit = edits[index]
    if (!edit) return point
    if (edit.absent) return { ...point, answer: 'absent' as const }
    if (edit.x === undefined || edit.y === undefined) return point
    return {
      ...point,
      answer: undefined,
      reviewed: true,
      prefill: { x: edit.x, y: edit.y, present: true, confidence: 1 },
    }
  })
  return next
}

/* Where the conveyor goes after a point is settled: on to the next one that
   still needs attention, or it stays put when the frame is done. */
export function nextPoint(item: IAnnotCase, from: number): number {
  const total = item.items?.length ?? 0
  for (let step = 1; step <= total; step += 1) {
    const index = (from + step) % total
    const state = pointState(item, index)
    if (state === 'suggested' || state === 'empty') return index
  }
  return from
}

/* ---------- drawing a foreign object ----------
   The outline is closed by hand, so a stray double-click must not leave a
   two-point «polygon» behind. */

export const MIN_POLYGON = 3

export function canClose(points: Point[]): boolean {
  return points.length >= MIN_POLYGON
}
