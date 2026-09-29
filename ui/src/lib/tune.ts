import type { IModelMetric } from '@/types'
import type { IRotationFrame } from '@/lib/settings'

/* Сначала показываем примеры из каждой части диапазона измерений.
   Обычное перемешивание могло бы скрыть редкие большие расстояния ниже экрана. */
export function variedRotationFrames(frames: IRotationFrame[]): IRotationFrame[] {
  if (frames.length < 2) return [...frames]

  const sorted = [...frames].sort((a, b) => a.value - b.value)
  const min = sorted[0].value
  const span = sorted[sorted.length - 1].value - min
  const buckets: IRotationFrame[][] = Array.from({ length: 8 }, () => [])

  for (const frame of sorted) {
    const index = span === 0 ? 0 : Math.min(7, Math.floor((frame.value - min) / span * 8))
    buckets[index].push(frame)
  }

  const shuffle = (items: IRotationFrame[]) => {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1))
      ;[items[index], items[other]] = [items[other], items[index]]
    }
  }

  buckets.forEach(shuffle)

  const result: IRotationFrame[] = []

  while (result.length < frames.length) {
    const batch = buckets.flatMap((bucket) => {
      const frame = bucket.pop()

      return frame ? [frame] : []
    })

    shuffle(batch)
    result.push(...batch)
  }

  return result
}

/* Сравниваем две версии модели по числам и направлению улучшения метрики.
   Границы анализатора задаются отдельно в lib/settings.ts. */

export function delta(metric: IModelMetric): { text: string; tone: 'ok' | 'bad' | 'dead' } {
  const difference = metric.next - metric.now
  if (difference === 0) return { text: 'без изменений', tone: 'dead' }

  const better = metric.goal === 'up' ? difference > 0 : difference < 0
  const sign = difference > 0 ? '+' : '−'
  const unit = metric.unit === '%' ? 'п. п.' : metric.unit

  return { text: `${sign}${Math.abs(difference)} ${unit}`, tone: better ? 'ok' : 'bad' }
}
