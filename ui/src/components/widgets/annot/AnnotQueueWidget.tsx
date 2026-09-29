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
import { ANNOT_SOURCE, ANNOT_SOURCE_TAG, ANNOT_TASK, REGION_SHORT } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { plural, whenOf } from '@/lib/utils'
import type { AnnotSource } from '@/types'

/* The filter is one thing across both screens: chosen here, it travels to the
   desk, «следующий» walks that same list and the counter counts it. */
const SOURCES: Array<AnnotSource | 'all'> = ['all', 'clinic', 'upload']

/* ============================================================
   Очередь заданий — where the work comes from.

   It is not a list kept somewhere: it is the studies the service has
   already been through, narrowed to those the analyser was unsure
   about, plus the frames somebody sent here to annotate right away.
   Everything on the screen comes out of the result of each study.
   ============================================================ */

const AnnotQueueWidget = () => {
  const { source, setSource, tab, setTab, open } = useAnnot()
  /* the source is asked of the server, so the chips carry no counts of their own */
  const { pending, done, processing, isLoading } = useAnnotQueue(source, true)
  const [sheet, setSheet] = useState(false)
  const navigate = useNavigate()

  if (isLoading) return <Loader />

  const bySource = (list: typeof pending) => list

  const queue = bySource(tab === 'pending' ? pending : done)

  const toDesk = (key: string) => {
    open(key)
    navigate('/markup/frame')
  }

  return (
    <>
      <WorkHead
        title="Очередь заданий"
        sub={`${bySource(pending).length} ${plural(bySource(pending).length, 'задание', 'задания', 'заданий')}`}
        lead="В очередь попадают снимки, на которых анализатор сомневается: не нашёл точку, не увидел гребень в кадре или засомневался в постороннем предмете. Размеченное не пропадает — его видно рядом, и разметку можно поправить."
      />

      <Card mark>
        <CardHead className="flex-wrap">
          <h3 className="h3-bold flex-1">Снимки</h3>
          <Chip
            on={tab === 'pending'}
            count={bySource(pending).length}
            onClick={() => setTab('pending')}
          >
            ждут разметки
          </Chip>
          <Chip on={tab === 'done'} count={bySource(done).length} onClick={() => setTab('done')}>
            размеченные
          </Chip>
          <Button className="h-8 px-3 text-[14px]" onClick={() => setSheet(true)}>
            Добавить снимки
          </Button>
          <span className="h-0 w-full" />
          <span className="text-[13px] text-muted">Источник</span>
          {SOURCES.map((id) => (
            <Chip
              key={id}
              on={source === id}
              onClick={() => setSource(id)}
            >
              {ANNOT_SOURCE[id]}
            </Chip>
          ))}
        </CardHead>

        {processing.length ? (
          <div className="border-b border-line bg-surface-2 px-5.5 py-3">
            <div className="small-regular text-muted">
              Обрабатываются, скоро появятся в очереди:{' '}
              {processing.length} {plural(processing.length, 'снимок', 'снимка', 'снимков')}
            </div>
            <ul className="m-0 mt-1.5 list-none p-0 text-[14px]">
              {processing.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-0.5">
                  <b>{item.file}</b>
                  <span className="text-muted">обрабатывается</span>
                  <span className="whitespace-nowrap text-muted">{whenOf(item.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {queue.length ? (
          <div className="pb-1">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line-2 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[12.5px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-muted">
                  <th>Снимок</th>
                  <th>Источник</th>
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
                    <td>
                      <Tag tone={item.source === 'clinic' ? '' : 'dead'}>
                        {ANNOT_SOURCE_TAG[item.source]}
                      </Tag>
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
