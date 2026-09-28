import type { IModelMetric } from '@/types'

/* Two versions of a model, side by side.

   Interpretation is not written out in words: every number carries the
   direction it should move, so this is arithmetic and a sign. There is no
   language model in the product, nothing to hand out an opinion.

   Where the boundaries of the analyser are concerned, see lib/settings.ts —
   those are not trained, they are chosen. */

export function delta(metric: IModelMetric): { text: string; tone: 'ok' | 'bad' | 'dead' } {
  const difference = metric.next - metric.now
  if (difference === 0) return { text: 'без изменений', tone: 'dead' }

  const better = metric.goal === 'up' ? difference > 0 : difference < 0
  const sign = difference > 0 ? '+' : '−'
  const unit = metric.unit === '%' ? 'п. п.' : metric.unit

  return { text: `${sign}${Math.abs(difference)} ${unit}`, tone: better ? 'ok' : 'bad' }
}
