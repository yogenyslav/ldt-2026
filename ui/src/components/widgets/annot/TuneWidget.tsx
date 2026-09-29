import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot } from '@/components/ui/card'
import Tag from '@/components/ui/tag'
import BandScale from '@/components/shared/BandScale'
import Empty from '@/components/shared/Empty'
import Hint from '@/components/shared/Hint'
import Loader from '@/components/shared/Loader'
import ScanTile from '@/components/shared/ScanTile'
import WorkHead from '@/components/shared/WorkHead'
import { useToast } from '@/components/ui/toast'
import { useJobs } from '@/hooks/useJobs'
import { useSaveSettings, useSettings } from '@/hooks/useSettings'
import {
  ROTATION_BANDS,
  ROTATION_MAX,
  ROTATION_MIN,
  ROTATION_STEP,
  centreToSettings,
  cutToSettings,
  normText,
  rotationBand,
  rotationCuts,
  rotationFrames,
  sameSettings,
  type IRotationSettings,
} from '@/lib/settings'
import { nm, plural } from '@/lib/utils'
import { variedRotationFrames } from '@/lib/tune'
import { errorText } from '@/lib/errors'
import type { Band } from '@/types'

/* Подбор параметров ротации по обработанным снимкам.
   Текущие настройки загружаются отдельно, расстояние и контур берутся
   из результатов анализа. Бегунки изменяют черновик параметров,
   по которому пересчитываются состояния примеров на экране. */

const TuneWidget = () => {
  const { data: jobs, isLoading } = useJobs(50)
  const { data: live, isLoading: settingsLoading } = useSettings()
  const save = useSaveSettings()
  const { toast } = useToast()
  const navigate = useNavigate()

  /* Черновик параметров до сохранения. */
  const [draft, setDraft] = useState<IRotationSettings | null>(null)

  const frames = useMemo(() => variedRotationFrames(rotationFrames(jobs)), [jobs])

  if (isLoading || settingsLoading) return <Loader />

  if (!live) {
    return (
      <>
        <WorkHead title="Подбор параметров" />
        <Card>
          <Empty
            icon={<SlidersHorizontal size={22} />}
            title="Не удалось загрузить параметры"
            text="Проверьте соединение и обновите страницу."
          />
        </Card>
      </>
    )
  }

  const settings = draft ?? live
  const cuts = rotationCuts(settings)
  const moved = !sameSettings(settings, live)

  const count: Record<Band, number> = { norm: 0, warn: 0, viol: 0 }
  for (const frame of frames) count[rotationBand(settings, frame.value)] += 1

  return (
    <>
      <WorkHead
        title="Подбор параметров"
        sub={`${frames.length} ${plural(frames.length, 'снимок', 'снимка', 'снимков')} бедра, которые прошли через сервис`}
      />

      <Card className="mt-4 mb-4.5" mark>
        <CardBody className="pt-4.5">
          <div className="mb-7 text-[16px] font-semibold">
            На сколько миллиметров малый вертел выступает за край кости
          </div>

          <BandScale
            min={ROTATION_MIN}
            max={ROTATION_MAX}
            step={ROTATION_STEP}
            unit="мм"
            cuts={cuts}
            bands={ROTATION_BANDS}
            centre={settings.trochanter_center_mm}
            onMoveCut={(index, value) => setDraft(cutToSettings(settings, index, value))}
            onMoveCentre={(value) => setDraft(centreToSettings(settings, value))}
          />

          <Hint>
            Чем меньше выступает малый вертел, тем сильнее бедро завёрнуто внутрь; чем сильнее
            выступает — тем больше развёрнуто наружу. Норма задаётся серединой и допуском вокруг
            неё, поэтому границы двигаются парами: сервис применяет их симметрично.
          </Hint>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3.5 text-[14px]">
            <span className="text-ink-2">
              Середина нормы <b className="tabular">{nm(settings.trochanter_center_mm)} мм</b>
            </span>
            <span className="text-ink-2">
              Допуск <b className="tabular">{nm(settings.trochanter_tol_percent, 0)} %</b>
            </span>
            <span className="text-ink-2">
              Полоса сомнения <b className="tabular">{nm(settings.trochanter_yellow_percent, 0)} %</b>
            </span>
            <span className="text-ink-2">
              Норма <b>{normText(settings)}</b>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag tone="ok">норма: {count.norm}</Tag>
            <Tag tone="warn">сомнение: {count.warn}</Tag>
            <Tag tone="bad">нарушение: {count.viol}</Tag>
          </div>
        </CardBody>

        <CardFoot>
          <Button
            variant="primary"
            disabled={!moved || save.isPending}
            onClick={async () => {
              try {
                await save.mutateAsync(settings)
                setDraft(null)
                toast({ title: `Норма ротации теперь ${normText(settings)}` })
              } catch (error) {
                toast({ variant: 'destructive', title: errorText(error, 'Не удалось сохранить параметры') })
              }
            }}
          >
            Сохранить
          </Button>
          <Button variant="quiet" disabled={!moved} onClick={() => setDraft(null)}>
            Вернуть прежние
          </Button>
          <span className="flex-1" />
          <span className="text-[13.5px] text-muted">
            новые границы применяются к следующим снимкам
          </span>
        </CardFoot>
      </Card>

      {frames.length ? (
        <div className="grid grid-cols-4 gap-3.5">
          {frames.map((frame) => (
            <ScanTile
              key={frame.jobId}
              frame={frame}
              status={rotationBand(settings, frame.value)}
              onOpen={() => navigate(`/study/${frame.jobId}`)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<SlidersHorizontal size={22} />}
            title="Снимков бедра пока нет"
            text="Ротацию меряют только на бедре. Границы можно двигать и сейчас, но проверить их будет не на чем."
          />
        </Card>
      )}
    </>
  )
}

export default TuneWidget
