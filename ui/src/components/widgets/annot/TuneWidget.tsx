import { useEffect, useState } from 'react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Tag from '@/components/ui/tag'
import BandScale from '@/components/shared/BandScale'
import Hint from '@/components/shared/Hint'
import Loader from '@/components/shared/Loader'
import ScanTile from '@/components/shared/ScanTile'
import WorkHead from '@/components/shared/WorkHead'
import { useToast } from '@/components/ui/toast'
import { useParams, useSaveParam, useShots } from '@/hooks/useAnnotation'
import { spread, statusOf } from '@/lib/tune'
import { plural } from '@/lib/utils'
import type { IParamSpec } from '@/types'

/* ============================================================
   Подбор параметров.

   Half of what the analyser decides is a measured number against a
   boundary. A boundary is not trained, it is chosen — and the
   doctor looking at the grid is the one doing the choosing.

   So there is nothing to compare against on this screen: no marks,
   no share of agreement. Only how the frames fall into the three
   states, and the frames themselves, each with the real outline of
   the measured area filled in the colour of its current state.
   ============================================================ */

/* Where the frames for tuning come from. */
const SOURCES: Array<[string, string]> = [
  ['clinic', 'последние из поликлиник'],
  ['upload', 'последние загруженные'],
]

const TuneWidget = () => {
  const { data: params } = useParams()
  const save = useSaveParam()
  const { toast } = useToast()

  const [pick, setPick] = useState<string | null>(null)
  const [source, setSource] = useState('clinic')
  /* The boundaries being dragged, before they are saved. */
  const [draft, setDraft] = useState<Record<string, number[]>>({})

  const id = pick ?? params?.[0]?.id
  const { data: shots } = useShots(id, source)

  /* Whatever comes back from the service is what «Вернуть прежние» returns to. */
  useEffect(() => setDraft({}), [params])

  if (!params?.length || !id) return <Loader />

  const saved = params.find((item) => item.id === id) as IParamSpec
  const param: IParamSpec = { ...saved, cuts: draft[id] ?? saved.cuts }
  const moved = !!draft[id]

  const count = spread(param, (shots ?? []).map((shot) => shot.value))
  const hasDoubt = param.bands.includes('warn')

  return (
    <>
      <WorkHead
        title="Подбор параметров"
        sub={
          shots
            ? `${shots.length} ${plural(shots.length, 'снимок', 'снимка', 'снимков')} · ` +
              (SOURCES.find(([key]) => key === source)?.[1] ?? '')
            : undefined
        }
      />

      <div className="my-3 flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface px-3.5 py-2.5">
        <span className="mr-1 text-[13px] text-muted">Параметр</span>
        {params.map((item) => (
          <Chip key={item.id} on={item.id === id} onClick={() => setPick(item.id)}>
            {item.title}
          </Chip>
        ))}
        <span className="flex-1" />
        <span className="mr-1 text-[13px] text-muted">Снимки</span>
        {SOURCES.map(([key, label]) => (
          <Chip key={key} on={source === key} onClick={() => setSource(key)}>
            {label}
          </Chip>
        ))}
      </div>

      <Card className="mb-4.5" mark>
        <CardBody className="pt-4.5">
          <div className="mb-4.5 text-[16px] font-semibold">{param.question}</div>

          <BandScale
            param={param}
            onChange={(cuts) => setDraft((current) => ({ ...current, [id]: cuts }))}
          />

          <Hint>{param.how}</Hint>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            <Tag tone="ok">норма: {count.norm}</Tag>
            {hasDoubt ? <Tag tone="warn">сомнение: {count.warn}</Tag> : null}
            <Tag tone="bad">нарушение: {count.viol}</Tag>
          </div>
        </CardBody>

        <CardFoot>
          <Button
            variant="primary"
            disabled={!moved || save.isPending}
            onClick={async () => {
              await save.mutateAsync({ id, cuts: param.cuts })
              setDraft((current) => {
                const next = { ...current }
                delete next[id]
                return next
              })
              toast({ title: `Границы сохранены: ${param.title.toLowerCase()}` })
            }}
          >
            Сохранить
          </Button>
          <Button
            variant="quiet"
            disabled={!moved}
            onClick={() =>
              setDraft((current) => {
                const next = { ...current }
                delete next[id]
                return next
              })
            }
          >
            Вернуть прежние
          </Button>
        </CardFoot>
      </Card>

      {shots ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3.5">
          {shots.map((shot) => (
            <ScanTile
              key={shot.key}
              shot={shot}
              status={statusOf(param, shot.value)}
              unit={param.unit}
            />
          ))}
        </div>
      ) : (
        <Loader />
      )}
    </>
  )
}

export default TuneWidget
