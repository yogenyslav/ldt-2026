import { useRef } from 'react'
import { BAND } from '@/constants'
import { cutLabel, positionOf, setCut, valueAt } from '@/lib/tune'
import { cn } from '@/lib/utils'
import type { IParamSpec } from '@/types'

/* ============================================================
   One scale with the boundaries on it. The stripes are the verdict
   and are named right on the scale; the handles are what is being
   chosen. Five stripes for the rotation, two for the crest — the
   bands are always one more than the boundaries.

   A handle cannot pass its neighbour, so the stripes never turn
   inside out, and the arrow keys move a boundary one step at a time.
   ============================================================ */

interface BandScaleProps {
  param: IParamSpec
  onChange: (cuts: number[]) => void
}

const BandScale = ({ param, onChange }: BandScaleProps) => {
  const track = useRef<HTMLDivElement>(null)
  const edges = [param.min, ...param.cuts, param.max]

  const dragTo = (index: number, clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    const value = valueAt(param, clientX, rect)
    if (value === null) return
    onChange(setCut(param, index, value))
  }

  return (
    <>
      <div className="relative mx-3.5 mb-1.5 h-[46px] rounded-[8px]" ref={track}>
        {param.bands.map((band, index) => (
          <div
            key={index}
            className={cn(
              'absolute top-0 flex h-[46px] items-center justify-center overflow-hidden',
              'text-[13px] font-semibold whitespace-nowrap',
              band === 'norm' ? 'band-norm' : band === 'warn' ? 'band-warn' : 'band-viol',
              index === 0 && 'rounded-l-[8px]',
              index === param.bands.length - 1 && 'rounded-r-[8px]',
            )}
            style={{
              left: `${positionOf(param, edges[index])}%`,
              width: `${positionOf(param, edges[index + 1]) - positionOf(param, edges[index])}%`,
            }}
          >
            <span className="px-1">{BAND[band].title}</span>
          </div>
        ))}

        {param.cuts.map((cut, index) => (
          <button
            key={index}
            type="button"
            aria-label={`граница ${cutLabel(param, cut)} ${param.unit}`}
            className="grip absolute -top-[7px] -ml-3.5 h-15 w-7 cursor-ew-resize touch-none border-0 bg-transparent p-0"
            style={{ left: `${positionOf(param, cut)}%` }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              dragTo(index, event.clientX)
            }}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
              if (!step) return
              event.preventDefault()
              onChange(setCut(param, index, cut + step * param.step))
            }}
          >
            <b className="absolute bottom-[-8px] left-1/2 -translate-x-1/2 rounded-[6px] border-[1.5px] border-brand bg-surface px-[7px] text-[12.5px] font-normal text-brand-700">
              {cutLabel(param, cut)}
            </b>
          </button>
        ))}
      </div>

      <div className="mx-3.5 mt-4.5 flex justify-between text-[12.5px] text-muted tabular">
        <span>
          {param.min} {param.unit}
        </span>
        <span>
          {param.max} {param.unit}
        </span>
      </div>
    </>
  )
}

export default BandScale
