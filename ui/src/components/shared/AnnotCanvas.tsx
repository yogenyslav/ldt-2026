import { useRef } from 'react'
import Tag from '@/components/ui/tag'
import { ANNOT_POINT_NAME, REGION_SHORT } from '@/constants'
import { pointState } from '@/lib/annotation'
import { cn } from '@/lib/utils'
import type { IAnnotCase, Point } from '@/types'

/* ============================================================
   The frame, and the instrument for marking it.

   Coordinates are original-frame pixels and the viewBox equals
   cols x rows, so what is drawn here is exactly what is sent: a
   click at the tip of the trochanter becomes that pixel, not a
   pixel of the screen.

   Points: a click on the bone puts the point in hand there, and
   the same gesture goes on dragging it, so it can be nudged before
   the finger is lifted. An existing marker is picked up by its own
   handle — that neither moves another point nor adds a stray one.

   Objects: the outline is drawn like a pencil draws — press, lead
   the pointer around the object, release, and the shape closes
   itself. There is no restricted area here: a foreign object
   anywhere on the frame is worth having.

   Only the region of the point in hand is lit, and softly: it is a
   hint about where to look, not a button to press.
   ============================================================ */

const path = (list: Point[]) => list.map(([x, y]) => `${x},${y}`).join(' ')

interface AnnotCanvasProps {
  item: IAnnotCase
  active: number
  /* the outline being laid down right now, if any */
  drawing: Point[] | null
  drawingKind: 'wire' | 'object' | null
  onPlace: (index: number, x: number, y: number) => void
  onPickPoint: (index: number) => void
  /* the pencil: one call to start the stroke, one per step, one to finish */
  onStrokeStart: (x: number, y: number) => void
  onStrokeMove: (x: number, y: number) => void
  onStrokeEnd: () => void
  onRemovePolygon: (index: number) => void
}

const AnnotCanvas = ({
  item,
  active,
  drawing,
  drawingKind,
  onPlace,
  onPickPoint,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
  onRemovePolygon,
}: AnnotCanvasProps) => {
  const svg = useRef<SVGSVGElement>(null)
  /* Which point the pointer is currently carrying, if any. */
  const held = useRef<number | null>(null)
  /* Whether the pencil is down right now. */
  const drawingNow = useRef(false)

  const points = item.items ?? []
  const drawable = item.task === 'foreign_seg'
  const current = points[active]
  const now = drawable
    ? drawingKind
      ? 'Обведите предмет: клик — точка контура, двойной клик — замкнуть'
      : 'Выберите, что обводите, в панели справа'
    : (ANNOT_POINT_NAME[current?.name ?? ''] ?? current?.title ?? '')

  /* Screen pixels to frame pixels. The overlay is stretched over the picture,
     which keeps the frame's own proportions, so this is a plain ratio. */
  const toFrame = (clientX: number, clientY: number): Point | null => {
    const box = svg.current?.getBoundingClientRect()
    if (!box?.width || !box.height) return null
    const x = ((clientX - box.left) / box.width) * item.cols
    const y = ((clientY - box.top) / box.height) * item.rows
    return [
      Math.min(Math.max(Math.round(x * 10) / 10, 0), item.cols),
      Math.min(Math.max(Math.round(y * 10) / 10, 0), item.rows),
    ]
  }

  const onBackdropDown = (event: React.PointerEvent) => {
    const at = toFrame(event.clientX, event.clientY)
    if (!at) return

    if (drawable) {
      if (!drawingKind) return
      event.preventDefault()
      drawingNow.current = true
      svg.current?.setPointerCapture(event.pointerId)
      onStrokeStart(at[0], at[1])
      return
    }
    if (active < 0 || !points.length) return

    event.preventDefault()
    held.current = active
    svg.current?.setPointerCapture(event.pointerId)
    onPlace(active, at[0], at[1])
  }

  /* Picking up a marker: select that point and carry it, without placing a
     second one under the finger. */
  const onMarkerDown = (index: number) => (event: React.PointerEvent) => {
    if (drawable) return
    event.preventDefault()
    event.stopPropagation()
    onPickPoint(index)
    held.current = index
    svg.current?.setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent) => {
    const at = toFrame(event.clientX, event.clientY)
    if (!at) return

    if (drawingNow.current) {
      onStrokeMove(at[0], at[1])
      return
    }
    if (held.current === null) return
    onPlace(held.current, at[0], at[1])
  }

  const onUp = (event: React.PointerEvent) => {
    if (drawingNow.current) {
      drawingNow.current = false
      svg.current?.releasePointerCapture(event.pointerId)
      onStrokeEnd()
      return
    }
    if (held.current === null) return
    held.current = null
    svg.current?.releasePointerCapture(event.pointerId)
  }

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
        {!drawable && active >= 0 ? (
          <span className="flex-center h-5.5 w-5.5 flex-none rounded-[6px] bg-brand text-[12px] font-bold text-white">
            {active + 1}
          </span>
        ) : null}
        <b>{now}</b>
        <span className="flex-1" />
        <span className="text-[13px] text-ink-2">
          {drawable
            ? 'обводить можно в любой части снимка'
            : 'кликните по кости — точка встанет туда, её можно тянуть'}
        </span>
      </div>

      <div className="flex justify-center bg-scan-bg p-4.5">
        {/* The frame takes the width it is given and keeps its own proportions,
            capped so that a tall scan still fits on the screen without
            scrolling. A DXA raster is small — 280 px across — so it is always
            enlarged; what must never happen is the reverse, a frame drawn one
            pixel to one pixel and impossible to aim at. */}
        <div
          className="relative leading-[0]"
          style={{
            aspectRatio: `${item.cols} / ${item.rows}`,
            width: `min(100%, calc(72vh * ${item.cols} / ${item.rows}))`,
          }}
        >
          <img
            className="block h-full w-full object-fill select-none"
            src={item.png}
            alt=""
            draggable={false}
          />
          <svg
            ref={svg}
            className={cn(
              'absolute inset-0 h-full w-full touch-none overflow-visible',
              drawable && !drawingKind ? 'cursor-default' : 'cursor-crosshair',
            )}
            viewBox={`0 0 ${item.cols} ${item.rows}`}
            preserveAspectRatio="none"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* The hit area. SVG has no background of its own, and this must
                be the only thing that takes a press: a shape drawn on top of
                it is a sibling, not a parent, so a press it swallowed would
                never reach here — which is how outlining came to stop working
                the moment the pointer was over an outline already drawn. */}
            <rect
              x={0}
              y={0}
              width={item.cols}
              height={item.rows}
              fill="transparent"
              onPointerDown={onBackdropDown}
            />

            {points.map((point, index) =>
              point.allowed_box ? (
                <rect
                  key={`zone-${point.name}`}
                  className={cn('zone', index === active && !drawable && 'is-active')}
                  x={point.allowed_box[0]}
                  y={point.allowed_box[1]}
                  width={point.allowed_box[2] - point.allowed_box[0]}
                  height={point.allowed_box[3] - point.allowed_box[1]}
                  rx={2}
                  pointerEvents="none"
                />
              ) : null,
            )}

            {item.polygons?.map((polygon, index) => (
              <g key={`poly-${index}`}>
                <polygon
                  className={cn(
                    polygon.cls === 'wire' ? 'poly-wire' : 'poly-object',
                    drawable && !drawingKind && 'cursor-pointer',
                  )}
                  points={path(polygon.points)}
                  /* While an outline is being laid down, everything already on
                     the frame steps out of the way — otherwise a corner cannot
                     be put inside or next to an existing shape. */
                  pointerEvents={drawable && !drawingKind ? 'auto' : 'none'}
                  onPointerDown={(event) => {
                    if (!drawable || drawingKind) return
                    event.stopPropagation()
                    onRemovePolygon(index)
                  }}
                />
                {/* The number is the only thing telling two wires apart in the
                    list beside the frame — without it "remove" is a guess. */}
                <text
                  className={cn('mark-name', polygon.cls === 'wire' ? 'text-mark-bad' : 'text-mark-ok')}
                  x={polygon.points[0][0] + 6}
                  y={polygon.points[0][1] - 6}
                  pointerEvents="none"
                >
                  {index + 1}
                </text>
              </g>
            ))}

            {/* The outline being laid down: the line so far and its corners. */}
            {drawing && drawing.length > 1 ? (
              <g pointerEvents="none">
                <polygon
                  className={drawingKind === 'wire' ? 'draft-fill-wire' : 'draft-fill-object'}
                  points={path(drawing)}
                />
                <polyline
                  className={drawingKind === 'wire' ? 'draft-wire' : 'draft-object'}
                  points={path(drawing)}
                />
              </g>
            ) : null}

            {points.map((point, index) => {
              const state = pointState(item, index)
              if (!point.prefill || state === 'absent') return null
              return (
                <g
                  key={`mark-${point.name}`}
                  className={cn(
                    'mark',
                    state === 'suggested' && 'is-model',
                    index === active && !drawable && 'is-active',
                  )}
                  pointerEvents="none"
                >
                  <circle cx={point.prefill.x} cy={point.prefill.y} r={6} />
                  <path
                    d={`M${point.prefill.x - 11} ${point.prefill.y}h22M${point.prefill.x} ${point.prefill.y - 11}v22`}
                  />
                  <text className="mark-name" x={point.prefill.x + 9} y={point.prefill.y - 8}>
                    {index + 1}
                  </text>
                  {/* The handle: big enough to grab, invisible so it does not
                      cover the anatomy under it. It is the only part of the
                      marker that takes a press — the ring and the label must
                      not swallow one meant for the bone underneath. */}
                  <circle
                    className={drawable ? '' : 'cursor-grab'}
                    cx={point.prefill.x}
                    cy={point.prefill.y}
                    r={9}
                    fill="transparent"
                    stroke="none"
                    pointerEvents={drawable ? 'none' : 'auto'}
                    onPointerDown={onMarkerDown(index)}
                  />
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

export default AnnotCanvas
