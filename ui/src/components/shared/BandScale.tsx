import { useRef } from 'react'
import { BAND } from '@/constants'
import { cn } from '@/lib/utils'
import type { Band } from '@/types'

/* Шкала с зонами решений и бегунками границ. Каждая граница симметрична
   относительно центра нормы: перемещение бегунка меняет и парную границу.
   Под шкалой расположен отдельный бегунок центра. */

const BAND_CLASS: Record<Band, string> = {
  norm: 'band-norm',
  warn: 'band-warn',
  viol: 'band-viol',
}

const label = (value: number, step: number) =>
  value.toFixed(step < 1 ? 1 : 0).replace('.', ',')

interface BandScaleProps {
  min: number
  max: number
  step: number
  unit: string
  cuts: number[]
  bands: Band[]
  /* Центр нормы, если он предусмотрен для этого параметра. */
  centre?: number
  onMoveCut: (index: number, value: number) => void
  onMoveCentre?: (value: number) => void
}

const BandScale = ({
  min,
  max,
  step,
  unit,
  cuts,
  bands,
  centre,
  onMoveCut,
  onMoveCentre,
}: BandScaleProps) => {
  const track = useRef<HTMLDivElement>(null)
  const edges = [min, ...cuts, max]
  const bounded = (value: number) => Math.min(Math.max(value, min), max)
  const at = (value: number) => ((bounded(value) - min) / (max - min)) * 100

  const valueAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box?.width) return null
    const share = Math.min(Math.max((clientX - box.left) / box.width, 0), 1)
    return min + share * (max - min)
  }

  const grip = (
    key: string,
    value: number,
    move: (next: number) => void,
    tone: 'cut' | 'centre',
  ) => (
    <button
      key={key}
      type="button"
      aria-label={`${tone === 'centre' ? 'центр нормы' : 'граница'} ${label(value, step)} ${unit}`}
      className={cn(
        'absolute -ml-3.5 w-7 cursor-ew-resize touch-none border-0 bg-transparent p-0',
        tone === 'centre' ? 'centre-grip top-[46px] h-4' : 'grip -top-[7px] h-15',
      )}
      style={{ left: `${at(value)}%` }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const next = valueAt(event.clientX)
        if (next !== null) move(next)
      }}
      onKeyDown={(event) => {
        const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (!direction) return
        event.preventDefault()
        move(bounded(value + direction * step))
      }}
    >
      <b
        className={cn(
          'absolute left-1/2 -translate-x-1/2 rounded-[6px] border-[1.5px] bg-surface px-[7px] text-[12.5px] font-normal',
          tone === 'centre'
            ? 'top-[16px] border-ink-2 text-ink-2'
            : 'bottom-[-8px] border-brand text-brand-700',
        )}
      >
        {label(value, step)}
      </b>
    </button>
  )

  return (
    <>
      <div className="relative mx-3.5 mb-1.5 h-[46px] rounded-[8px]" ref={track}>
        {bands.map((band, index) => (
          <div
            key={index}
            className={cn(
              'absolute top-0 flex h-[46px] items-center justify-center overflow-hidden',
              'text-[13px] font-semibold whitespace-nowrap',
              BAND_CLASS[band],
              index === 0 && 'rounded-l-[8px]',
              index === bands.length - 1 && 'rounded-r-[8px]',
            )}
            style={{
              left: `${at(edges[index])}%`,
              width: `${at(edges[index + 1]) - at(edges[index])}%`,
            }}
          >
            <span className="px-1">{BAND[band].title}</span>
          </div>
        ))}

        {cuts.map((cut, index) =>
          grip(`cut-${index}`, cut, (next) => onMoveCut(index, next), 'cut'),
        )}

        {centre !== undefined && onMoveCentre
          ? grip('centre', centre, onMoveCentre, 'centre')
          : null}
      </div>

      <div className="mx-3.5 mt-11 flex justify-between text-[12.5px] text-muted tabular">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
    </>
  )
}

export default BandScale
