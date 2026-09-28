import { Trash2 } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Kbd from '@/components/ui/kbd'
import Tag from '@/components/ui/tag'
import Hint from '@/components/shared/Hint'
import { FOREIGN_ANSWER, FOREIGN_KIND } from '@/constants'
import { cn } from '@/lib/utils'
import type { IAnnotPolygon, Point } from '@/types'

/* ============================================================
   Посторонние предметы. There is no region to stay inside of here:
   an object anywhere on the frame is worth having, even where the
   model does not look today — which is a question left with ML
   (context/back_annotations.md).

   Picking what is being outlined arms the pencil: press on the scan,
   lead the pointer around the object and release — the shape closes
   itself. Esc drops a stroke half-drawn.

   A clean frame is just as needed an answer as a dirty one, so it
   is a button of its own and not the absence of one.
   ============================================================ */

const TONE: Record<string, string> = {
  bad: 'bg-bad-bg text-bad',
  ok: 'bg-ok-bg text-ok',
}

interface ForeignCardProps {
  polygons: IAnnotPolygon[]
  kind: 'wire' | 'object' | null
  drawing: Point[] | null
  answer: string | null
  onKind: (kind: 'wire' | 'object' | null) => void
  onRemove: (index: number) => void
  onAnswer: (id: string) => void
}

const ForeignCard = ({
  polygons,
  kind,
  drawing,
  answer,
  onKind,
  onRemove,
  onAnswer,
}: ForeignCardProps) => {
  const drawingNow = !!drawing?.length

  return (
    <Card>
      <CardHead>
        <h3 className="h3-bold flex-1">Посторонние предметы</h3>
        <Tag tone={polygons.length ? '' : 'dead'}>обведено: {polygons.length}</Tag>
      </CardHead>

      <CardBody className="pt-0">
        {FOREIGN_KIND.map((item, index) => {
          const on = kind === item.id
          return (
            <div
              key={item.id}
              className={cn(
                'border-t border-line pt-3 pb-0.5 first:border-t-0 first:pt-0.5',
                on &&
                  '-mx-3 my-2 rounded-soft border-t-0 bg-brand-050 p-3 shadow-[inset_0_0_0_1.5px_var(--color-brand)]',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex-center h-5.5 w-5.5 flex-none rounded-[6px] text-[12px] font-bold tabular',
                    TONE[item.tone],
                  )}
                >
                  {index + 1}
                </span>
                <span className="flex-1 font-semibold">{item.title}</span>
                <Button
                  variant={on ? 'primary' : 'default'}
                  className="h-8 px-3 text-[14px]"
                  onClick={() => onKind(on ? null : (item.id as 'wire' | 'object'))}
                >
                  {on ? 'обводим' : 'обвести'}
                  <Kbd className={on ? 'border-white/35 bg-transparent text-white/85' : undefined}>
                    {index + 1}
                  </Kbd>
                </Button>
              </div>

              {on ? (
                <div className="mt-2.5 ml-[31px] flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] text-ink-2">
                    {drawingNow
                      ? 'ведите вокруг предмета, отпустите — контур замкнётся'
                      : 'обведите предмет на снимке, удерживая кнопку мыши'}
                  </span>
                </div>
              ) : null}
            </div>
          )
        })}

        {polygons.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <span className="mb-2 block text-[13.5px] text-ink-2">Обведено на снимке</span>
            <div className="flex flex-col gap-1.5">
              {polygons.map((polygon, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2.5 rounded-soft bg-surface-2 px-2.5 py-1.5"
                >
                  <span
                    className={cn(
                      'h-2.5 w-2.5 flex-none rounded-[3px]',
                      polygon.cls === 'wire' ? 'bg-bad' : 'bg-ok',
                    )}
                  />
                  <span className="flex-1 text-[14px]">
                    {FOREIGN_KIND.find((item) => item.id === polygon.cls)?.title ?? polygon.cls}
                  </span>
                  <span className="text-[12.5px] text-muted tabular">
                    {polygon.points.length} точек
                  </span>
                  <button
                    type="button"
                    title="Убрать обводку"
                    aria-label="Убрать обводку"
                    onClick={() => onRemove(index)}
                    className="flex-center h-7 w-7 flex-none cursor-pointer rounded-soft text-muted transition-colors hover:bg-bad-bg hover:text-bad"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 border-t border-line pt-3">
          <span className="font-semibold">Что в итоге на снимке</span>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            {FOREIGN_ANSWER.map((option) => (
              <Chip key={option.id} on={answer === option.id} onClick={() => onAnswer(option.id)}>
                {option.title}
              </Chip>
            ))}
          </div>
        </div>

        <Hint>
          Обводите предметы в любой части снимка. Чистый снимок тоже отмечайте: это такой же нужный
          ответ.
        </Hint>
      </CardBody>
    </Card>
  )
}

export default ForeignCard
