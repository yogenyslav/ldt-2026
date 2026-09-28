import type { AnnotSource, IAnnotCase, IQueueItem, PointState } from '@/types'

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
  if (item.blank) return 'empty'
  const point = item.items?.[index]
  if (!point?.prefill) return 'empty'
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
    items: item.items?.map((point) => ({ ...point, prefill: null, reviewed: false })),
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

/* Position inside that filtered queue, as the panel prints it. */
export function placeInQueue(keys: string[], current: string, total: number): string {
  const index = keys.indexOf(current)
  if (index < 0) return ''
  return `${index + 1} из ${total || keys.length}`
}

/* Which frame the desk shows next after the current one is sent. */
export function nextKey(keys: string[], current: string): string | null {
  const index = keys.indexOf(current)
  if (index < 0) return keys[0] ?? null
  return keys[index + 1] ?? null
}
