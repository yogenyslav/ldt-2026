import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardHead } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Tag from '@/components/ui/tag'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import WorkHead from '@/components/shared/WorkHead'
import UploadSheet from '@/components/widgets/annot/UploadSheet'
import { ANNOT_TASK, REGION_SHORT } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { plural, whenOf } from '@/lib/utils'

/* ============================================================
   Очередь заданий — where the work comes from.

   It is not a list kept somewhere: it is the studies the service has
   already been through, narrowed to those the analyser was unsure
   about, plus the frames somebody sent here to annotate right away.
   Everything on the screen comes out of the result of each study.
   ============================================================ */

const AnnotQueueWidget = () => {
  const { pending, done, isLoading } = useAnnotQueue()
  const { open } = useAnnot()
  const [sheet, setSheet] = useState(false)
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const navigate = useNavigate()

  if (isLoading) return <Loader />

  const queue = tab === 'pending' ? pending : done

  const toDesk = (key: string) => {
    open(key)
    navigate('/markup/frame')
  }

  return (
    <>
      <WorkHead
        title="Очередь заданий"
        sub={`${pending.length} ${plural(pending.length, 'задание', 'задания', 'заданий')}`}
        lead="В очередь попадают снимки, на которых анализатор сомневается: не нашёл точку, не увидел гребень в кадре или засомневался в постороннем предмете. Размеченное не пропадает — его видно рядом, и разметку можно поправить."
      />

      <Card mark>
        <CardHead>
          <h3 className="h3-bold flex-1">Снимки</h3>
          <Chip on={tab === 'pending'} count={pending.length} onClick={() => setTab('pending')}>
            ждут разметки
          </Chip>
          <Chip on={tab === 'done'} count={done.length} onClick={() => setTab('done')}>
            размеченные
          </Chip>
          <Button className="h-8 px-3 text-[14px]" onClick={() => setSheet(true)}>
            Добавить снимки
          </Button>
        </CardHead>

        {queue.length ? (
          <div className="pb-1">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line-2 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[12.5px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-muted">
                  <th>Снимок</th>
                  <th>Область</th>
                  <th>Задача</th>
                  <th>Предварительная разметка</th>
                  <th>{tab === 'pending' ? 'Почему в очереди' : 'Что размечали'}</th>
                  <th>Загружен</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr
                    key={item.key}
                    className="[&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-2.5 [&>td]:align-middle last:[&>td]:border-b-0 hover:bg-hover"
                  >
                    <td>
                      <b>{item.file}</b>
                      {item.cols ? (
                        <div className="text-[13.5px] text-muted tabular">
                          {item.cols}×{item.rows}
                        </div>
                      ) : null}
                    </td>
                    <td>{REGION_SHORT[item.region]}</td>
                    <td>{ANNOT_TASK[item.task]}</td>
                    <td>
                      {item.pre ? <Tag tone="ok">есть</Tag> : <Tag tone="warn">нет, с нуля</Tag>}
                    </td>
                    <td>{tab === 'pending' ? item.why : 'разметка отправлена'}</td>
                    <td className="whitespace-nowrap text-muted">{whenOf(item.created_at)}</td>
                    <td>
                      <Button className="h-8 px-3 text-[14px]" onClick={() => toDesk(item.key)}>
                        {tab === 'pending' ? 'Открыть' : 'Поправить'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<Inbox size={22} />}
            title={tab === 'pending' ? 'Размечать нечего' : 'Пока ничего не размечено'}
            text={
              tab === 'pending'
                ? 'Анализатор уверен во всём, что через него прошло. Добавьте свои снимки, чтобы разметить их.'
                : 'Размеченные снимки появятся здесь, и разметку можно будет поправить.'
            }
          />
        )}
      </Card>

      <UploadSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}

export default AnnotQueueWidget
