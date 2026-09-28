import type { Band, IModelMetric, IParamSpec } from '@/types'

/* ============================================================
   Picking the boundaries by eye, and reading the difference between
   two versions of a model.

   Half of what the analyser decides is a measured number against a
   boundary. A boundary is not trained, it is chosen — and there is
   nothing to compare the choice against, because the doctor looking
   at the grid is the one deciding what counts as correct. So this
   file only turns a number into one of the three states and keeps
   the boundaries in order; no agreement score, no metrics.
   ============================================================ */

/* Which of the three states a measured value falls into. The stripes are read
   left to right, so `bands` is one longer than `cuts`. */
export function statusOf(param: IParamSpec, value: number): Band {
  for (let index = 0; index < param.cuts.length; index += 1) {
    if (value < param.cuts[index]) return param.bands[index]
  }
  return param.bands[param.bands.length - 1]
}

/* How the frames of the set fall into the three states — the only score on the
   screen, and it is a count, not a verdict about the choice. */
export function spread(param: IParamSpec, values: number[]): Record<Band, number> {
  const count: Record<Band, number> = { norm: 0, warn: 0, viol: 0 }
  for (const value of values) count[statusOf(param, value)] += 1
  return count
}

/* Rounding that matches the step: a tenth-step scale keeps one decimal. */
const digitsOf = (step: number) => (step < 1 ? 1 : 0)

export function roundToStep(step: number, value: number): number {
  return Number((Math.round(value / step) * step).toFixed(digitsOf(step)))
}

/* Moving one boundary. Neighbours keep one step of room, so two boundaries
   never sit on top of each other and a stripe cannot vanish without a trace. */
export function setCut(param: IParamSpec, index: number, value: number): number[] {
  const low = index === 0 ? param.min : param.cuts[index - 1] + param.step
  const high = index === param.cuts.length - 1 ? param.max : param.cuts[index + 1] - param.step
  const [lo, hi] = low > high ? [(low + high) / 2, (low + high) / 2] : [low, high]

  const cuts = param.cuts.slice()
  cuts[index] = roundToStep(param.step, Math.min(Math.max(value, lo), hi))
  return cuts
}

/* Where along the scale a pointer landed, as a value of the parameter. */
export function valueAt(param: IParamSpec, clientX: number, rect: DOMRect): number | null {
  if (!rect.width) return null
  const share = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  return param.min + share * (param.max - param.min)
}

/* Share of the scale a value sits at, in percent. */
export function positionOf(param: IParamSpec, value: number): number {
  return ((value - param.min) / (param.max - param.min)) * 100
}

export function cutLabel(param: IParamSpec, value: number): string {
  return value.toFixed(digitsOf(param.step)).replace('.', ',')
}

/* ---------- two versions of a model, side by side ----------
   Interpretation is not written out in words: every number carries the
   direction it should move, so this is arithmetic and a sign. There is no
   language model in the product, nothing to hand out an opinion. */

export function delta(metric: IModelMetric): { text: string; tone: 'ok' | 'bad' | 'dead' } {
  const difference = metric.next - metric.now
  if (difference === 0) return { text: 'без изменений', tone: 'dead' }

  const better = metric.goal === 'up' ? difference > 0 : difference < 0
  const sign = difference > 0 ? '+' : '−'
  const unit = metric.unit === '%' ? 'п. п.' : metric.unit

  return { text: `${sign}${Math.abs(difference)} ${unit}`, tone: better ? 'ok' : 'bad' }
}
