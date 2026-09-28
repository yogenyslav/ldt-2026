import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Kbd from '@/components/ui/kbd'
import Tag from '@/components/ui/tag'
import Hint from '@/components/shared/Hint'
import { FOREIGN_ANSWER, FOREIGN_KIND } from '@/constants'
import { cn } from '@/lib/utils'
import type { IAnnotCase } from '@/types'

/* ============================================================
   Посторонние предметы. There is no region to stay inside of here:
   an object anywhere on the frame is worth having, even where the
   model does not look today — which is a question left with ML
   (context/backend_requests.md).

   A clean frame is just as needed an answer as a dirty one, so it
   is a button of its own and not the absence of one.
   ============================================================ */

const TONE: Record<string, string> = {
  bad: 'bg-bad-bg text-bad',
  ok: 'bg-ok-bg text-ok',
}

interface ForeignCardProps {
  item: IAnnotCase
  answer: string | null
  onAnswer: (id: string) => void
}

const ForeignCard = ({ item, answer, onAnswer }: ForeignCardProps) => {
  const drawn = item.polygons?.length ?? 0

  return (
    <Card>
      <CardHead>
        <h3 className="h3-bold flex-1">Посторонние предметы</h3>
        <Tag tone={drawn ? '' : 'dead'}>обведено: {drawn}</Tag>
      </CardHead>

      <CardBody className="pt-0">
        {FOREIGN_KIND.map((kind, index) => (
          <div
            key={kind.id}
            className={cn(
              'border-t border-line pt-3 pb-0.5 first:border-t-0 first:pt-0.5',
              index === 0 &&
                '-mx-3 my-2 rounded-soft border-t-0 bg-brand-050 p-3 shadow-[inset_0_0_0_1.5px_var(--color-brand)]',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex-center h-5.5 w-5.5 flex-none rounded-[6px] text-[12px] font-bold tabular',
                  TONE[kind.tone],
                )}
              >
                {index + 1}
              </span>
              <span className="flex-1 font-semibold">{kind.title}</span>
              <Button className="h-8 px-3 text-[14px]">
                обвести <Kbd>{index + 1}</Kbd>
              </Button>
            </div>
          </div>
        ))}

        <div className="border-t border-line pt-3 pb-0.5">
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
          Обводите предметы в любой части снимка. Чистый снимок тоже отмечайте: это такой же
          нужный ответ.
        </Hint>
      </CardBody>
    </Card>
  )
}

export default ForeignCard
