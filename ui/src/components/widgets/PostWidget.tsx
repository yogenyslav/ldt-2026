import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ScanLine,
  TriangleAlert,
} from 'lucide-react'
import Button from '@/components/ui/button'
import CriteriaList from '@/components/shared/CriteriaList'
import DropZone from '@/components/shared/DropZone'
import Picker from '@/components/shared/Picker'
import Viewer from '@/components/shared/Viewer'
import { useToast } from '@/components/ui/toast'
import { REGION, STATUS, VERDICT_POST } from '@/constants'
import { useCabinet } from '@/context/CabinetContext'
import { useStation } from '@/context/StationContext'
import { useUploadScan } from '@/hooks/useUpload'
import { brokenNames } from '@/lib/criteria'
import { cn, plural, timeOf } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo, VerdictKind } from '@/types'

/* Scope A — radiographer station.

   One patient at a time. The attempts of the visit pile up until one of them is
   accepted; "Переснять" sends nothing to the backend, it only asks for the next
   scan. The decision is made once, by choosing an attempt — see lib/station.ts. */

const TONE: Record<string, { box: string; icon: string; title: string }> = {
  ok: { box: 'border-ok-line bg-ok-bg', icon: 'text-ok', title: 'text-ok' },
  warn: { box: 'border-warn-line bg-warn-bg', icon: 'text-warn', title: 'text-warn' },
  bad: { box: 'border-bad-line bg-bad-bg', icon: 'text-bad', title: 'text-bad' },
  none: { box: 'border-dead-line bg-dead-bg', icon: 'text-dead', title: 'text-dead' },
}

const ICON: Record<VerdictKind, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  ok: Check,
  warn: TriangleAlert,
  bad: RefreshCw,
  none: TriangleAlert,
  failed: TriangleAlert,
  wait: RefreshCw,
}

const isBusy = (job?: IJobInfo) => job?.status === 'pending' || job?.status === 'processing'

/* Device mode between patients: nothing to do but wait. */
const Waiting = () => (
  <div className="flex flex-col items-center gap-3.5 p-10 text-center text-scan-text">
    <span className="flex-center h-11.5 w-11.5 rounded-control border border-scan-line">
      <ScanLine size={22} />
    </span>
    <div className="text-[17px] font-semibold text-scan-text-on">Ожидание снимка с аппарата</div>
    <div className="small-regular">
      Экран обновится сам через 2–3 секунды после сканирования.
      <br />
      Загружать ничего не нужно.
    </div>
  </div>
)

const PostWidget = () => {
  const { cabinet } = useCabinet()
  const station = useStation()
  const upload = useUploadScan()
  const { toast } = useToast()

  const fileInput = useRef<HTMLInputElement>(null)
  const [focus, setFocus] = useState<'now' | 'prev'>('now')
  const [prevIndex, setPrevIndex] = useState(0)
  /* Comparison turns itself on from the second attempt; the button stays, so it
     can be turned off — and comes back with the next attempt. */
  const [compareOff, setCompareOff] = useState(false)

  const { attempts, current, awaiting, patient } = station
  const manual = cabinet.intake === 'upload'

  useEffect(() => {
    setCompareOff(false)
    setFocus('now')
    setPrevIndex(0)
  }, [attempts.length])

  const send = async (file: File) => {
    try {
      const uploaded = await upload.mutateAsync(file)
      station.attach(uploaded.job_id)
      toast({ title: 'Снимок принят, идёт обработка' })
    } catch {
      toast({ title: 'Не удалось загрузить снимок', variant: 'destructive' })
    }
  }

  /* "Переснять" is not a decision: it asks for the next attempt. In manual mode
     that means picking the file right away — the technologist is going to shoot
     again anyway. */
  const askRetake = () => {
    station.retake()
    if (manual) fileInput.current?.click()
  }

  /* Between patients. */
  if (!current) {
    return (
      <div className="min-h-0 flex-1 p-5">
        <div className="flex-center h-full rounded-panel border border-scan-line bg-scan-bg">
          {manual ? (
            <div className="w-full max-w-[460px] px-6">
              <DropZone
                accept=".dcm,application/dicom"
                title="Загрузите снимок"
                hint="перетащите файл исследования в это окно или выберите его на диске"
                action="Выбрать файл"
                busy={upload.isPending}
                busyLabel="Снимок загружается"
                onFile={(file) => void send(file)}
                tone="dark"
              />
            </div>
          ) : (
            <Waiting />
          )}
        </div>
      </div>
    )
  }

  const history = [...attempts].reverse().filter((job) => job.id !== current.id)
  const compare = attempts.length > 1 && !compareOff
  const previous = history.length ? history[Math.min(prevIndex, history.length - 1)] : undefined
  const showPrev = compare && !!previous && focus === 'prev'
  const shown = showPrev ? (previous as IJobInfo) : current

  const level = verdictOf(shown)
  const meta = VERDICT_POST[level]
  const tone = TONE[meta.tone] ?? TONE.none
  const Icon = ICON[level]
  const busy = isBusy(shown)

  const broken = shown.status === 'completed' ? brokenNames(shown) : []
  const subtitle = busy
    ? `${STATUS[shown.status]} — несколько секунд`
    : shown.status === 'failed'
      ? 'Снимок не удалось обработать'
      : `${shown.anatomical_region ? REGION[shown.anatomical_region] : 'Область не определена'} — ${
          broken.length ? broken.join(', ') : 'замечаний нет'
        }`

  const take = async (job: IJobInfo) => {
    await station.accept(job)
    toast({ title: 'Исследование принято' })
  }

  const actions = showPrev ? (
    <>
      <Button variant="ok" size="lg" onClick={() => void take(shown)}>
        <Check size={16} />
        Принять эту попытку
      </Button>
      <Button size="lg" onClick={() => setFocus('now')}>
        <ArrowRight size={16} />
        Вернуться к текущей
      </Button>
    </>
  ) : busy ? (
    <div className="col-span-2 flex items-center justify-center gap-3 py-3.5 small-regular text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-line border-t-brand" />
      Решение можно принять, когда разбор будет готов
    </div>
  ) : level === 'bad' || level === 'failed' ? (
    <>
      <Button variant="bad" size="lg" onClick={askRetake}>
        <RefreshCw size={16} />
        Переснять
      </Button>
      <Button size="lg" onClick={() => void take(shown)}>
        Всё равно принять
      </Button>
    </>
  ) : (
    <>
      <Button variant="ok" size="lg" onClick={() => void take(shown)}>
        <Check size={16} />
        {level === 'ok' ? 'Пациент свободен' : 'Принять'}
      </Button>
      <Button size="lg" onClick={askRetake}>
        <RefreshCw size={16} />
        Переснять
      </Button>
    </>
  )

  const prevHead = previous ? (
    <>
      <button
        type="button"
        disabled={prevIndex === 0}
        onClick={(event) => {
          event.stopPropagation()
          setPrevIndex((value) => Math.max(0, value - 1))
          setFocus('prev')
        }}
        className="flex-center h-6 w-6 flex-none cursor-pointer rounded-soft border border-scan-line text-scan-text disabled:cursor-not-allowed disabled:opacity-35 hover:border-scan-edge"
      >
        <ChevronLeft size={14} />
      </button>

      <Picker
        dark
        current={previous}
        items={history}
        label={`Попытка ${attempts.findIndex((job) => job.id === previous.id) + 1} из ${attempts.length}`}
        count="выбрать"
        onPick={(job) => {
          setPrevIndex(history.findIndex((item) => item.id === job.id))
          setFocus('prev')
        }}
      />

      <button
        type="button"
        disabled={prevIndex >= history.length - 1}
        onClick={(event) => {
          event.stopPropagation()
          setPrevIndex((value) => Math.min(history.length - 1, value + 1))
          setFocus('prev')
        }}
        className="flex-center h-6 w-6 flex-none cursor-pointer rounded-soft border border-scan-line text-scan-text disabled:cursor-not-allowed disabled:opacity-35 hover:border-scan-edge"
      >
        <ChevronRight size={14} />
      </button>
    </>
  ) : null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,1fr)_minmax(480px,560px)] gap-5 p-5">
      {/* manual mode: the retake is chosen here, without leaving the screen */}
      <input
        ref={fileInput}
        type="file"
        accept=".dcm,application/dicom"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void send(file)
          event.target.value = ''
        }}
      />

      <Viewer
        job={current}
        compareWith={compare && previous ? previous : undefined}
        focus={focus}
        onFocus={setFocus}
        canCompare={history.length > 0}
        compareOn={compare}
        onToggleCompare={() => {
          setCompareOff((value) => !value)
          setFocus('now')
        }}
        prevHead={prevHead}
      />

      {/* The panel is centred vertically against the scan viewport.
          my-auto rather than justify-center: it centres while there is spare
          height. max-h-full keeps the panel inside the screen — only the
          criteria list scrolls, while the verdict and the actions stay put. */}
      <div className="flex min-h-0 flex-col">
        <div className="my-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-surface">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface-2 px-[22px] py-2.5 small-regular">
            <span className="font-semibold">Пациент {patient || '—'}</span>
            <span className="text-line-2">·</span>
            <span className="text-muted">
              {attempts.length} {plural(attempts.length, 'попытка', 'попытки', 'попыток')}
            </span>
            {showPrev ? (
              <span className="ml-auto font-medium text-brand-700">
                разбор попытки, {timeOf(shown.created_at)}
              </span>
            ) : null}
          </div>

          <div className={cn('flex shrink-0 items-center gap-4.5 border-b px-6 py-6', tone.box)}>
            <span className={cn('flex-center h-14 w-14 flex-none rounded-[18px] bg-surface', tone.icon)}>
              <Icon size={30} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <div
                className={cn(
                  'text-[clamp(22px,2.2vw,30px)] leading-[1.1] font-bold tracking-[-0.03em]',
                  tone.title,
                )}
              >
                {meta.title}
              </div>
              <div className="mt-1 small-regular text-ink-2">{subtitle}</div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto">
            {busy ? (
              <div className="p-[22px]">
                <p className="m-0 base-regular text-ink-2">
                  {shown.file_name ? `Файл ${shown.file_name} принят. ` : ''}
                  Идёт разбор укладки: система определяет область съёмки и проверяет критерии.
                </p>
              </div>
            ) : shown.status === 'failed' ? (
              <div className="p-[22px]">
                <p className="m-0 base-regular">
                  Переснимите исследование. Если ошибка повторится, сообщите в центр обработки.
                </p>
                <p className="mt-2.5 mb-0 base-regular text-ink-2">{shown.error}</p>
              </div>
            ) : (
              <CriteriaList job={shown} />
            )}
          </div>

          {/* Waiting for the next attempt: the buttons stay where they were, the
              strip above them says what the station is doing. */}
          {awaiting && !showPrev ? (
            <div className="flex shrink-0 items-center gap-3 border-t border-line bg-brand-050 px-[22px] py-2.5 small-regular text-brand-700">
              {manual ? (
                <>
                  <span className="flex-1">Выберите файл повторного снимка</span>
                  <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                    {upload.isPending ? 'Загружается…' : 'Выбрать файл'}
                  </Button>
                </>
              ) : (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand" />
                  Ждём повторный снимок с аппарата
                </>
              )}
            </div>
          ) : null}

          <div className="shrink-0 border-t border-line p-4.5">
            <div className="grid grid-cols-2 gap-2.5">{actions}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostWidget
