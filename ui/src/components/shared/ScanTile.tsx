import { BAND } from '@/constants'
import { useDicomImage } from '@/hooks/useDicomImage'
import { cn, nm } from '@/lib/utils'
import type { IRotationFrame } from '@/lib/settings'
import type { Band } from '@/types'

/* One frame of the tuning grid: the study as the service stored it, with the
   area it measured outlined and filled in the colour of the state that frame
   is in right now. Moving a boundary repaints it.

   The picture keeps its own proportions through aspect-ratio: cropping it
   would move the outline off the bone, because the overlay is drawn in the
   pixels of the original frame. */

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
  frame: IRotationFrame
  status: Band
  onOpen?: () => void
}

const ScanTile = ({ frame, status, onOpen }: ScanTileProps) => {
  const { src } = useDicomImage(frame.dicomId)

  return (
    <figure className="m-0 rounded-soft border-[1.5px] border-line bg-surface p-2">
      <button
        type="button"
        onClick={onOpen}
        title={frame.file}
        className={cn(
          'relative block w-full overflow-hidden rounded-[6px] bg-scan-bg leading-[0]',
          onOpen && 'cursor-pointer',
        )}
        style={{ aspectRatio: `${frame.cols}/${frame.rows}` }}
      >
        {src ? <img className="block h-full w-full object-fill" src={src} alt="" /> : null}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${frame.cols} ${frame.rows}`}
          preserveAspectRatio="none"
        >
          {frame.regions.map((region, index) => (
            <polygon
              key={index}
              className={FILL[status]}
              points={region.map(([x, y]) => `${x},${y}`).join(' ')}
            />
          ))}
        </svg>
      </button>

      <figcaption className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular">{nm(frame.value)} мм</span>
        <span className={cn('text-[13px] font-semibold', TEXT[status])}>{BAND[status].title}</span>
      </figcaption>
    </figure>
  )
}

export default ScanTile
