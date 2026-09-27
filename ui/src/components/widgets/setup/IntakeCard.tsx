import { useEffect, useState } from 'react'
import { Check, Radio, Upload } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import { useCabinet } from '@/context/CabinetContext'
import { useLatestJobs } from '@/hooks/useJobs'
import { cn, timeOf } from '@/lib/utils'
import type { Intake } from '@/lib/cabinet'

/* How scans reach this room. Decided once, during setup: with a queue of
   patients there is no time to work out mid-shift why nothing is arriving. */

const OPTIONS: Array<{
  value: Intake
  title: string
  text: string
  icon: React.ComponentType<{ size?: number }>
}> = [
  {
    value: 'device',
    title: 'Приём с аппарата',
    text: 'Денситометр сам отправляет исследование в архив, экран приёма подхватывает его через несколько секунд. Лаборанту не нужно ничего загружать.',
    icon: Radio,
  },
  {
    value: 'upload',
    title: 'Загрузка по кнопке',
    text: 'Лаборант выбирает файл исследования на экране приёма. Подходит, если аппарат не настроен на отправку или снимок принесли на носителе.',
    icon: Upload,
  },
]

/* The check is shown in both modes: before switching a room over to manual
   uploads it is worth knowing whether the densitometer can send at all.
   Any job created after the check has started counts as an arrival. */
const WINDOW_MS = 90_000

const IntakeCheck = () => {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const { data: jobs } = useLatestJobs(startedAt !== null)

  const arrived = startedAt
    ? [...(jobs ?? [])].find((job) => Date.parse(job.created_at) >= startedAt)
    : undefined

  useEffect(() => {
    if (startedAt === null) return
    const timer = setTimeout(() => setStartedAt(null), WINDOW_MS)
    return () => clearTimeout(timer)
  }, [startedAt])

  if (arrived) {
    return (
      <div className="flex w-full items-center gap-3 rounded-control border border-ok-line bg-ok-bg px-4 py-3.5">
        <Check size={18} className="text-ok" />
        <span className="flex-1 base-semibold text-ok">
          Снимок получен в {timeOf(arrived.created_at)}
        </span>
        <Button variant="quiet" onClick={() => setStartedAt(null)}>
          Закрыть
        </Button>
      </div>
    )
  }

  if (startedAt !== null) {
    return (
      <div className="flex w-full items-center gap-3 rounded-control border border-line bg-surface-2 px-4 py-3.5">
        <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-line border-t-brand" />
        <span className="flex-1 base-regular text-ink-2">
          Ждём снимок с аппарата — отправьте тестовое исследование в архив
        </span>
        <Button variant="quiet" onClick={() => setStartedAt(null)}>
          Отменить
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2.5">
      <Button onClick={() => setStartedAt(Date.now())}>Ждать снимок</Button>
      <span className="small-regular text-muted">проверка приёма с аппарата</span>
    </div>
  )
}

const IntakeCard = () => {
  const { cabinet, update } = useCabinet()

  return (
    <Card mark>
      <CardHead>
        <Radio size={20} className="text-brand" />
        <span className="h3-bold">Режим приёма</span>
        <span className="flex-1" />
        <span className="small-regular text-muted">настройка этого рабочего места</span>
      </CardHead>

      <CardBody className="flex-1 grid grid-cols-2 gap-3 pt-0 content-start">
        {OPTIONS.map((option) => {
          const active = cabinet.intake === option.value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ intake: option.value })}
              className={cn(
                'cursor-pointer rounded-control border-[1.5px] p-4 text-left transition-colors',
                active
                  ? 'border-brand bg-brand-050'
                  : 'border-line-2 bg-surface hover:border-brand-400 hover:bg-hover',
              )}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex-center h-9 w-9 flex-none rounded-control',
                    active ? 'bg-brand text-white' : 'bg-surface-3 text-muted',
                  )}
                >
                  <Icon size={18} />
                </span>
                <span className="flex-1 base-semibold">{option.title}</span>
                {active ? <Check size={18} className="text-brand" /> : null}
              </span>
              <span className="mt-2.5 block small-regular text-muted">{option.text}</span>
            </button>
          )
        })}
      </CardBody>

      <CardFoot className="bg-surface-2">
        <IntakeCheck />
      </CardFoot>
    </Card>
  )
}

export default IntakeCard
