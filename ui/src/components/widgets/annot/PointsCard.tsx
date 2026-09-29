import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Check from '@/components/ui/check'
import Kbd from '@/components/ui/kbd'
import Tag from '@/components/ui/tag'
import Hint from '@/components/shared/Hint'
import { ANNOT_POINT_NAME, POINT_STATE } from '@/constants'
import { pointStates, type PointEdits } from '@/lib/annotation'
import { cn, nm } from '@/lib/utils'
import type { IAnnotCase, PointState } from '@/types'

/* ============================================================
   The points of the frame. Only the one in hand is unfolded; the
   rest are a line with a state. Switching is done with the digits,
   «нет на снимке» with the space bar — the numbers are printed on
   the rows so the keyboard needs no explaining.

   The point itself is put on the scan, not here: this side says
   where it stands and lets it be taken back.
   ============================================================ */

interface PointsCardProps {
  item: IAnnotCase
  active: number
  edited: PointEdits
  onPick: (index: number) => void
  onAbsent: (index: number) => void
  onConfirm: (index: number) => void
  onReset: (index: number) => void
}

const PointsCard = ({
  item,
  active,
  edited,
  onPick,
  onAbsent,
  onConfirm,
  onReset,
}: PointsCardProps) => {
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
        {points.map((point, index) => {
          const state = states[index]
          const badge = POINT_STATE[state]
          const isActive = index === active
          const mine = !!edited[index] && !edited[index].absent
          const at = point.prefill

          return (
            <div
              key={point.name}
              className={cn(
                'border-t border-line pt-3 pb-0.5 first:border-t-0 first:pt-0.5',
                isActive &&
                  '-mx-3 my-2 rounded-soft border-t-0 bg-brand-050 p-3 shadow-[inset_0_0_0_1.5px_var(--color-brand)]',
              )}
            >
              <button
                type="button"
                onClick={() => onPick(index)}
                className="flex w-full cursor-pointer items-center gap-2.5 text-left"
              >
                <span className="flex-center h-5.5 w-5.5 flex-none rounded-[6px] bg-surface-3 text-[12px] font-bold text-ink-2 tabular">
                  {index + 1}
                </span>
                <span className="flex-1 font-semibold">
                  {ANNOT_POINT_NAME[point.name] ?? point.title}
                </span>
                <Tag tone={badge.tone}>{badge.title}</Tag>
              </button>

              {isActive ? (
                <div className="mt-2.5 ml-[31px] flex flex-wrap items-center gap-2.5">
                  <Check on={state === 'absent'} tone="bad" onClick={() => onAbsent(index)}>
                    нет на снимке <Kbd>пробел</Kbd>
                  </Check>

                  {state === 'suggested' ? (
                    <Button className="h-8 px-3 text-[14px]" onClick={() => onConfirm(index)}>
                      всё верно
                    </Button>
                  ) : null}

                  {mine || edited[index] ? (
                    <Button
                      variant="quiet"
                      className="h-8 px-3 text-[14px]"
                      onClick={() => onReset(index)}
                    >
                      вернуть как было
                    </Button>
                  ) : null}

                  {mine && at ? (
                    <span className="text-[12.5px] text-muted tabular">
                      {nm(at.x)} × {nm(at.y)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}

        <Hint>
          Кликните по кости — точка встанет туда; поставленную можно подхватить и подвинуть. Если
          анатомия обрезана краем снимка — «нет на снимке»: такие снимки нужны не меньше остальных.
        </Hint>
      </CardBody>
    </Card>
  )
}

export type { PointState }
export default PointsCard
