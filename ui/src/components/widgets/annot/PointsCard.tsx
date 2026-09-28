import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Check from '@/components/ui/check'
import Kbd from '@/components/ui/kbd'
import Tag from '@/components/ui/tag'
import Hint from '@/components/shared/Hint'
import { ANNOT_POINT_NAME, POINT_STATE } from '@/constants'
import { pointStates } from '@/lib/annotation'
import { cn } from '@/lib/utils'
import type { IAnnotCase, PointState } from '@/types'

/* ============================================================
   The points of the frame. Only the one in hand is unfolded; the
   rest are a line with a state. Switching is done with the digits,
   «нет на снимке» with the space bar — the numbers are printed on
   the rows so the keyboard needs no explaining.
   ============================================================ */

interface PointsCardProps {
  item: IAnnotCase
  active: number
  onPick: (index: number) => void
  onAbsent: (index: number) => void
  onConfirm: (index: number) => void
}

const PointsCard = ({ item, active, onPick, onAbsent, onConfirm }: PointsCardProps) => {
  const states = pointStates(item)
  const points = item.items ?? []

  return (
    <Card>
      <CardHead>
        <h3 className="h3-bold flex-1">Точки на снимке</h3>
        <span className="text-[13.5px] text-muted">
          переключение —
          {points.map((point, index) => (
            <Kbd key={point.name}>{index + 1}</Kbd>
          ))}
        </span>
      </CardHead>

      <CardBody className="pt-0">
        {points.map((point, index) => (
          <Row
            key={point.name}
            index={index}
            name={ANNOT_POINT_NAME[point.name] ?? point.title}
            state={states[index]}
            active={index === active}
            onPick={() => onPick(index)}
            onAbsent={() => onAbsent(index)}
            onConfirm={() => onConfirm(index)}
          />
        ))}

        <Hint>
          Точка ставится на кость. Если анатомия обрезана краем снимка — «нет на снимке»: такие
          снимки нужны не меньше остальных.
        </Hint>
      </CardBody>
    </Card>
  )
}

interface RowProps {
  index: number
  name: string
  state: PointState
  active: boolean
  onPick: () => void
  onAbsent: () => void
  onConfirm: () => void
}

const Row = ({ index, name, state, active, onPick, onAbsent, onConfirm }: RowProps) => {
  const badge = POINT_STATE[state]

  return (
    <div
      className={cn(
        'border-t border-line pt-3 pb-0.5 first:border-t-0 first:pt-0.5',
        active && '-mx-3 my-2 rounded-soft border-t-0 bg-brand-050 p-3 shadow-[inset_0_0_0_1.5px_var(--color-brand)]',
      )}
    >
      <button
        type="button"
        onClick={onPick}
        className="flex w-full cursor-pointer items-center gap-2.5 text-left"
      >
        <span className="flex-center h-5.5 w-5.5 flex-none rounded-[6px] bg-surface-3 text-[12px] font-bold text-ink-2 tabular">
          {index + 1}
        </span>
        <span className="flex-1 font-semibold">{name}</span>
        <Tag tone={badge.tone}>{badge.title}</Tag>
      </button>

      {active ? (
        <div className="mt-2.5 ml-[31px] flex items-center gap-2.5">
          <Check on={state === 'absent'} tone="bad" onClick={onAbsent}>
            нет на снимке <Kbd>пробел</Kbd>
          </Check>
          {state === 'suggested' ? (
            <Button className="h-8 px-3 text-[14px]" onClick={onConfirm}>
              всё верно
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default PointsCard
