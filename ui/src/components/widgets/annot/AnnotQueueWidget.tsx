import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Tag from '@/components/ui/tag'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import Tile from '@/components/shared/Tile'
import WorkHead from '@/components/shared/WorkHead'
import UploadSheet from '@/components/widgets/annot/UploadSheet'
import { ANNOT_PRIORITY, ANNOT_SOURCE, ANNOT_SOURCE_TAG, ANNOT_TASK, REGION_SHORT } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { ANNOT_CASES } from '@/services/mock/annotCases'
import { nm, plural } from '@/lib/utils'
import type { AnnotSource } from '@/types'

/* ============================================================
   Очередь заданий — where the work comes from.

   Two ways in, both needed: the stream from the clinics, of which
   only the doubtful frames are queued, and frames uploaded here,
   with or without a run through the models.

   The source filter is not local to this screen: it travels to the
   desk, so «следующий» there walks the same list.
   ============================================================ */

const SOURCES: Array<AnnotSource | 'all'> = ['all', 'clinic', 'upload']

/* The frames themselves are demo data of the annotation contour; the real
   service answers with the frame beside its queue line. */
const frameOf = (key: string) => ANNOT_CASES.find((item) => item.key === key)

const AnnotQueueWidget = () => {
  const { data, isLoading } = useAnnotQueue()
  const { source, setSource, open } = useAnnot()
  const [sheet, setSheet] = useState(false)
  const navigate = useNavigate()

  if (isLoading || !data) return <Loader />

  const queue = data.queue
  const shown = source === 'all' ? queue : queue.filter((item) => item.source === source)

  const toDesk = (key: string, pre: boolean) => {
    open(key, !pre)
    navigate('/markup/frame')
  }

  return (
    <>
      <WorkHead
        title="Очередь заданий"
        sub={`${data.total.all} ${plural(data.total.all, 'снимок', 'снимка', 'снимков')}`}
        lead="Основной поток — снимки из поликлиник, которые уже прошли анализатор: в очередь из них попадают те, где модель не уверена или расходится с таблицей разметки. Рядом второй вход — загрузка своих снимков, с прогоном через модели или без него."
      />

      <Card className="mb-4.5" mark>
        <CardBody className="pt-4.5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {data.tiles.map((tile) => (
              <Tile key={tile.label} {...tile} />
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4.5">
        <CardHead>
          <h3 className="h3-bold flex-1">Что размечать</h3>
          {SOURCES.map((id) => (
            <Chip
              key={id}
              on={source === id}
              count={id === 'all' ? queue.length : queue.filter((item) => item.source === id).length}
              onClick={() => setSource(id)}
            >
              {ANNOT_SOURCE[id]}
            </Chip>
          ))}
          <Button className="h-8 px-3 text-[14px]" onClick={() => setSheet(true)}>
            Добавить снимки
          </Button>
        </CardHead>

        {shown.length ? (
          <div className="pb-1">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line-2 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[12.5px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-muted">
                  <th />
                  <th>Снимок</th>
                  <th>Источник</th>
                  <th>Задача</th>
                  <th>Предварительная разметка</th>
                  <th className="text-right!">Уверенность</th>
                  <th>Почему в очереди</th>
                  <th>Приоритет</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const frame = frameOf(item.key)
                  if (!frame) return null
                  const priority = ANNOT_PRIORITY[item.priority]

                  return (
                    <tr
                      key={item.key}
                      className="[&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-2.5 [&>td]:align-middle last:[&>td]:border-b-0 hover:bg-hover"
                    >
                      <td>
                        <img
                          className="h-10 w-11 rounded-[6px] bg-scan-bg object-cover"
                          src={frame.png}
                          alt=""
                        />
                      </td>
                      <td>
                        <b>{frame.file}</b>
                        <div className="text-[13.5px] text-muted">
                          {REGION_SHORT[frame.region]} · {frame.cols}×{frame.rows}
                        </div>
                      </td>
                      <td>
                        <Tag tone={item.source === 'clinic' ? '' : 'dead'}>
                          {ANNOT_SOURCE_TAG[item.source]}
                        </Tag>
                        <div className="text-[13.5px] text-muted">{item.from}</div>
                      </td>
                      <td>{ANNOT_TASK[item.task]}</td>
                      <td>
                        {item.pre ? (
                          <Tag tone="ok">есть</Tag>
                        ) : (
                          <Tag tone="warn">нет, с нуля</Tag>
                        )}
                      </td>
                      <td className="text-right tabular">{nm(item.confidence, 2)}</td>
                      <td>{item.why}</td>
                      <td>
                        <Tag tone={priority.tone}>{priority.title}</Tag>
                      </td>
                      <td>
                        <Button
                          className="h-8 px-3 text-[14px]"
                          onClick={() => toDesk(item.key, item.pre)}
                        >
                          Открыть
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<Inbox size={22} />}
            title="В этой части очереди ничего нет"
            text="Смените источник или добавьте свои снимки."
          />
        )}
      </Card>

      <UploadSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}

export default AnnotQueueWidget
