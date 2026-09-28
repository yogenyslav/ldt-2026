import { BAND } from '@/constants'
import { cn, nm } from '@/lib/utils'
import type { Band, ITuneShot } from '@/types'

/* One frame of the tuning grid: the real picture, the real outline of the
   measured area, filled in the colour of the state the frame is in right now.
   Dragging a boundary repaints it.

   The picture keeps its own proportions through aspect-ratio: cropping it would
   move the outline off the bone, because the overlay is drawn in frame pixels. */

const FILL: Record<Band, string> = {
  norm: 'fill-norm',
  warn: 'fill-warn',
  viol: 'fill-viol',
}

const TEXT: Record<Band, string> = {
  norm: 'text-ok',
  warn: 'text-warn',
  viol: 'text-bad',
}

interface ScanTileProps {
  shot: ITuneShot
  status: Band
  unit: string
}

const ScanTile = ({ shot, status, unit }: ScanTileProps) => {
  return (
    <figure className="m-0 rounded-soft border-[1.5px] border-line bg-surface p-2">
      <div
        className="relative overflow-hidden rounded-[6px] bg-scan-bg leading-[0]"
        style={{ aspectRatio: `${shot.cols}/${shot.rows}` }}
      >
        <img className="block h-full w-full object-fill" src={shot.png} alt="" />
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${shot.cols} ${shot.rows}`}
          preserveAspectRatio="none"
        >
          {shot.shapes.map((shape, index) => (
            <polygon
              key={index}
              className={FILL[status]}
              points={shape.map(([x, y]) => `${x},${y}`).join(' ')}
            />
          ))}
        </svg>
      </div>

      <figcaption className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular">
          {unit === '%' ? shot.value : nm(shot.value)} {unit}
        </span>
        <span className={cn('text-[13px] font-semibold', TEXT[status])}>{BAND[status].title}</span>
      </figcaption>
    </figure>
  )
}

export default ScanTile
