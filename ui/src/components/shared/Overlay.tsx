import { POINT_MARK } from '@/constants'
import { nm } from '@/lib/utils'
import { levelOfCriterion } from '@/lib/verdict'
import type { ICriterion, IJobInfo, Point, VerdictKind } from '@/types'

/* Overlay drawn on top of the scan.
   Coordinates are pixels of the original scan, so the viewBox matches
   metadata.shape and everything scales on its own. The image is fitted with
   object-fit: contain and the svg follows the same rule, so they align exactly. */

const MARK_COLOR: Record<string, string> = {
  ok: 'text-mark-ok',
  warn: 'text-mark-warn',
  bad: 'text-mark-bad',
  '': 'text-mark-dead',
  none: 'text-mark-dead',
  wait: 'text-mark-dead',
  failed: 'text-mark-bad',
}

const tone = (level: VerdictKind | '') => MARK_COLOR[level] ?? 'text-mark-dead'

const detailsOf = (criterion: ICriterion) => criterion.details ?? {}

interface OverlayProps {
  job: IJobInfo
}

const Overlay = ({ job }: OverlayProps) => {
  const meta = job.metadata ?? {}
  const criteria = meta.criteria
  if (!meta.shape || !criteria) return null

  const [height, width] = meta.shape
  const groups: React.ReactNode[] = []

  const dot = (point: Point, radius = 2.4, key?: string) => (
    <circle key={key} cx={point[0]} cy={point[1]} r={radius} fill="currentColor" />
  )

  const label = (x: number, y: number, value: string, anchor?: 'end') => (
    <text className="mk-label" x={x} y={y} textAnchor={anchor}>
      {value}
    </text>
  )

  /* --- spine axis: a line between the midpoints of the two point pairs --- */
  const axis = criteria.spine_axis
  if (axis?.points?.top_left) {
    const points = axis.points
    const mid = (a: string, b: string): Point => [
      (points[a][0] + points[b][0]) / 2,
      (points[a][1] + points[b][1]) / 2,
    ]
    const top = mid('top_left', 'top_right')
    const bottom = mid('bottom_left', 'bottom_right')

    groups.push(
      <g key="axis" className={tone(levelOfCriterion(axis))}>
        <line className="mk-line" x1={top[0]} y1={top[1]} x2={bottom[0]} y2={bottom[1]} />
        {Object.keys(points).map((name) => dot(points[name], 2.2, name))}
        {axis.value !== null && axis.value !== undefined
          ? label((top[0] + bottom[0]) / 2 + 7, (top[1] + bottom[1]) / 2, `${nm(axis.value)}°`)
          : null}
      </g>,
    )
  }

  /* --- iliac crests: two windows in the bottom corners, coloured per side --- */
  const crest = criteria.pelvis_crest
  const square = detailsOf(crest ?? ({} as ICriterion)).square as
    | { width_px: number; height_px: number; left_ok: boolean; right_ok: boolean }
    | undefined

  if (crest && square) {
    const { width_px: boxWidth, height_px: boxHeight, left_ok: leftOk, right_ok: rightOk } = square
    groups.push(
      <g key="crest-left" className={tone(leftOk ? 'ok' : 'bad')}>
        <rect className="mk-box" x={0} y={height - boxHeight} width={boxWidth} height={boxHeight} />
      </g>,
      <g key="crest-right" className={tone(rightOk ? 'ok' : 'bad')}>
        <rect
          className="mk-box"
          x={width - boxWidth}
          y={height - boxHeight}
          width={boxWidth}
          height={boxHeight}
        />
      </g>,
    )

    for (const name of Object.keys(crest.points ?? {})) {
      const point = (crest.points as Record<string, Point>)[name]
      const flip = point[0] > width * 0.6
      groups.push(
        <g key={`crest-${name}`} className={tone('ok')}>
          <circle
            cx={point[0]}
            cy={point[1]}
            r={4}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            className="mk-marker"
            x={point[0] + (flip ? -8 : 8)}
            y={point[1] + 4}
            textAnchor={flip ? 'end' : undefined}
          >
            {POINT_MARK[name]?.mark ?? '?'}
          </text>
        </g>,
      )
    }
  }

  /* --- foreign objects --- */
  const foreign = criteria.foreign_objects
  if (foreign?.regions?.length) {
    groups.push(
      <g key="foreign" className={tone(levelOfCriterion(foreign))}>
        {foreign.regions.map((polygon, index) => (
          <polygon
            key={index}
            className="mk-area"
            points={polygon.map((point) => `${point[0]},${point[1]}`).join(' ')}
          />
        ))}
      </g>,
    )
  }

  /* --- hip margins: perpendiculars to the frame edges --- */
  const margins = criteria.hip_margins
  if (margins?.points && Object.keys(margins.points).length) {
    const points = margins.points
    const details = detailsOf(margins)
    const segments: Array<{ from: Point; to: Point; value: unknown }> = []

    if (points.apex) segments.push({ from: points.apex, to: [points.apex[0], 0], value: details.top_cm })
    if (points.lateral) {
      segments.push({
        from: points.lateral,
        to: [points.lateral[0] < width / 2 ? 0 : width - 1, points.lateral[1]],
        value: details.side_cm,
      })
    }
    if (points.ischium) {
      segments.push({ from: points.ischium, to: [points.ischium[0], height - 1], value: details.bottom_cm })
    }

    groups.push(
      <g key="margins" className={tone(levelOfCriterion(margins))}>
        {segments.map((segment, index) => {
          const midX = (segment.from[0] + segment.to[0]) / 2
          const midY = (segment.from[1] + segment.to[1]) / 2
          const near = midX > width * 0.68
          return (
            <g key={index}>
              <line
                className="mk-thin"
                x1={segment.from[0]}
                y1={segment.from[1]}
                x2={segment.to[0]}
                y2={segment.to[1]}
              />
              {dot(segment.from, 2)}
              {typeof segment.value === 'number'
                ? label(near ? midX - 5 : midX + 5, midY - 3, `${nm(segment.value)} см`, near ? 'end' : undefined)
                : null}
            </g>
          )
        })}
      </g>,
    )
  }

  /* --- three hip keypoints: a circle and a Cyrillic letter --- */
  const keypoints = criteria.hip_keypoints
  if (keypoints?.points && Object.keys(keypoints.points).length) {
    const points = keypoints.points
    groups.push(
      <g key="keypoints" className={tone(levelOfCriterion(keypoints))}>
        {Object.keys(points).map((name) => (
          <g key={name}>
            <circle
              cx={points[name][0]}
              cy={points[name][1]}
              r={5}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <text className="mk-marker" x={points[name][0] + 6} y={points[name][1] + 4}>
              {POINT_MARK[name]?.mark ?? '?'}
            </text>
          </g>
        ))}
      </g>,
    )
  }

  /* --- lesser trochanter: the area the analyser measured across, and — once
     the analyser sends them — the two edge points that area was measured
     between, drawn as a line rather than left to be read off the fill. */
  const trochanter = criteria.lesser_trochanter
  if (trochanter?.regions?.length || (trochanter?.points?.near && trochanter?.points?.far)) {
    const near = trochanter.points?.near
    const far = trochanter.points?.far
    const anchor = near ?? trochanter.regions?.[0]?.[0]
    groups.push(
      <g key="trochanter" className={tone(levelOfCriterion(trochanter))}>
        {trochanter.regions?.map((polygon, index) => (
          <polygon
            key={index}
            className="mk-area"
            points={polygon.map((point) => `${point[0]},${point[1]}`).join(' ')}
          />
        ))}
        {near && far ? (
          <>
            <line className="mk-line" x1={near[0]} y1={near[1]} x2={far[0]} y2={far[1]} />
            {dot(near, 2.2, 'near')}
            {dot(far, 2.2, 'far')}
          </>
        ) : null}
        {trochanter.value && anchor ? label(anchor[0] + 7, anchor[1] - 2, `${nm(trochanter.value)} мм`) : null}
      </g>,
    )
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {groups}
    </svg>
  )
}

export default Overlay
