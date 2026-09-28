import Tag from '@/components/ui/tag'
import { ANNOT_POINT_NAME, REGION_SHORT } from '@/constants'
import { pointState } from '@/lib/annotation'
import { cn } from '@/lib/utils'
import type { IAnnotCase } from '@/types'

/* ============================================================
   The frame itself, with what is being marked on it.

   Coordinates are original-frame pixels and the viewBox equals
   cols x rows, so a marker sits exactly where a real submission
   would put it — the picture is never cropped.

   Only the region of the point in hand is lit, and softly: it is a
   hint about where to look, not a button to press. The variants
   «all at once» and «no regions» stayed in prototype/annotation-lab.html.
   ============================================================ */

const Marker = ({
  x,
  y,
  label,
  model,
  active,
}: {
  x: number
  y: number
  label: string
  model: boolean
  active: boolean
}) => (
  <g className={cn('mark', model && 'is-model', active && 'is-active')}>
    <circle cx={x} cy={y} r={6} />
    <path d={`M${x - 11} ${y}h22M${x} ${y - 11}v22`} />
    <text className="mark-name" x={x + 9} y={y - 8} fill="currentColor">
      {label}
    </text>
  </g>
)

const points = (list: [number, number][]) => list.map(([x, y]) => `${x},${y}`).join(' ')

/* `active` comes from the desk, not from the frame: the annotator can step
   back to a point that is already settled. */
const AnnotCanvas = ({ item, active }: { item: IAnnotCase; active: number }) => {
  const now =
    item.items && active >= 0
      ? (ANNOT_POINT_NAME[item.items[active].name] ?? item.items[active].title)
      : 'Обведите посторонние предметы'

  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-ink-2">
        <b>{REGION_SHORT[item.region]}</b>
        <span>{item.file}</span>
        <span className="flex-1" />
        {item.blank ? (
          <Tag>отметки ставите вы</Tag>
        ) : (
          <Tag tone="warn">предварительная разметка моделью</Tag>
        )}
      </div>

      {/* The one line the eye returns to: what is being marked right now. */}
      <div className="flex items-center gap-2.5 border-b border-line bg-brand-050 px-3.5 py-2.5 text-[15px]">
        {item.items && active >= 0 ? (
          <span className="flex-center h-5.5 w-5.5 flex-none rounded-[6px] bg-brand text-[12px] font-bold text-white">
            {active + 1}
          </span>
        ) : null}
        <b>{now}</b>
        <span className="flex-1" />
        <span className="text-[13px] text-ink-2">
          {item.items && active >= 0
            ? 'подсвечена область, где эта точка бывает'
            : 'обводить можно в любой части снимка'}
        </span>
      </div>

      <div className="flex justify-center bg-scan-bg p-4.5">
        <div className="relative max-w-full leading-[0]" style={{ width: item.cols * item.scale }}>
          <img className="block h-auto w-full" src={item.png} alt="" />
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${item.cols} ${item.rows}`}
            preserveAspectRatio="none"
          >
            {item.items?.map((point, index) => (
              <rect
                key={`zone-${point.name}`}
                className={cn('zone', index === active && 'is-active')}
                x={point.allowed_box[0]}
                y={point.allowed_box[1]}
                width={point.allowed_box[2] - point.allowed_box[0]}
                height={point.allowed_box[3] - point.allowed_box[1]}
                rx={2}
              />
            ))}

            {/* No restricted area here: a foreign object anywhere on the frame
                is worth having, even where the model does not look today. */}
            {item.polygons?.map((polygon, index) => (
              <polygon
                key={`poly-${index}`}
                className={polygon.cls === 'wire' ? 'poly-wire' : 'poly-object'}
                points={points(polygon.points)}
              />
            ))}

            {item.items?.map((point, index) => {
              const state = pointState(item, index)
              if (!point.prefill || state === 'absent') return null
              return (
                <Marker
                  key={`mark-${point.name}`}
                  x={point.prefill.x}
                  y={point.prefill.y}
                  label={String(index + 1)}
                  model={state === 'suggested'}
                  active={index === active}
                />
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

export default AnnotCanvas
