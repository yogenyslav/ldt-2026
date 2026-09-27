import { useEffect, useMemo, useState } from 'react'
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
import { DECISION, REGION, STATUS, VERDICT_POST } from '@/constants'
import { useCabinet } from '@/context/CabinetContext'
import { useDecideJob, useLatestJobs } from '@/hooks/useJobs'
import { useUploadScan } from '@/hooks/useUpload'
import { brokenNames } from '@/lib/criteria'
import { cn, timeOf } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { Decision, IJobInfo, VerdictKind } from '@/types'

/* Scope A — radiographer station.
   A single screen: verdict, criteria with expandable explanations, actions.

   How the scan gets here is decided once, in the settings of the room: either
   the densitometer sends it to the PACS itself and the screen picks it up, or
   the technologist uploads the file. Two ways of working, not a switch to flip
   in the middle of a queue of patients. */

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

/* Device mode: nothing to do but wait. */
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

/* Manual mode: the same dark viewport, with the one action it has in it. The
   file can be dropped anywhere on the panel. */
const Dropping = ({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) => (
  <div className="w-full max-w-[460px] px-6">
    <DropZone
      accept=".dcm,application/dicom"
      title="Загрузите снимок"
      hint="перетащите файл исследования в это окно или выберите его на диске"
      action="Выбрать файл"
      busy={busy}
      busyLabel="Снимок загружается"
      onFile={onFile}
      tone="dark"
    />
  </div>
)

const PostWidget = () => {
  const { cabinet } = useCabinet()
  const decide = useDecideJob()
  const upload = useUploadScan()
  const { toast } = useToast()

  const [compare, setCompare] = useState(false)
  const [focus, setFocus] = useState<'now' | 'prev'>('now')
  const [prevIndex, setPrevIndex] = useState(0)
  /* Manual mode does not poll, so a scan of our own is followed until it is
     processed and then the screen goes quiet again. */
  const [follow, setFollow] = useState(false)

  const { data: jobs, isLoading } = useLatestJobs(cabinet.intake === 'device' || follow)

  /* Scans are reviewed in arrival order: a patient must not be skipped.
     Reviewed ones become earlier attempts of the shift and can be flipped
     through in comparison mode. */
  const { current, history } = useMemo(() => {
    const byTime = [...(jobs ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const fresh = byTime.filter((job) => !job.specialist_decision)
    const done = [...byTime].reverse().filter((job) => job.specialist_decision)
    return { current: fresh[0] as IJobInfo | undefined, history: done }
  }, [jobs])

  useEffect(() => {
    if (follow && !isBusy(current)) setFollow(false)
  }, [follow, current])

  const previous = history.length ? history[Math.min(prevIndex, history.length - 1)] : undefined
  const showPrev = compare && !!previous && focus === 'prev'
  const shown = showPrev ? (previous as IJobInfo) : current

  if (isLoading) {
    return (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,1fr)_minmax(480px,560px)] gap-5 p-5">
        <div className="rounded-panel bg-scan-bg" />
        <div />
      </div>
    )
  }

  const send = async (file: File) => {
    try {
      await upload.mutateAsync(file)
      setFollow(true)
      setCompare(false)
      setFocus('now')
      toast({ title: 'Снимок принят, идёт обработка' })
    } catch {
      toast({ title: 'Не удалось загрузить снимок', variant: 'destructive' })
    }
  }

  if (!current || !shown) {
    return (
      <div className="min-h-0 flex-1 p-5">
        <div className="flex-center h-full rounded-panel border border-scan-line bg-scan-bg">
          {cabinet.intake === 'device' ? (
            <Waiting />
          ) : (
            <Dropping busy={upload.isPending} onFile={(file) => void send(file)} />
          )}
        </div>
      </div>
    )
  }

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

  const apply = async (decision: Decision) => {
    await decide.mutateAsync({ jobIds: [current.id], decision })
    setCompare(false)
    setFocus('now')
    setPrevIndex(0)
    toast({
      title: DECISION[decision],
      variant: decision === 'rejected' ? 'destructive' : 'default',
    })
  }

  /* Looking at an earlier attempt does not take the decision away: the
     radiographer compares the two and accepts the new scan right here. The
     second button only closes the comparison. */
  const actions = showPrev ? (
    <>
      {isBusy(current) ? null : (
        <Button variant="ok" size="lg" onClick={() => apply('approved')}>
          <Check size={16} />
          Принять новый
        </Button>
      )}
      <Button
        size="lg"
        className={isBusy(current) ? 'col-span-2' : undefined}
        onClick={() => setFocus('now')}
      >
        <ArrowRight size={16} />
        Вернуться к новому
      </Button>
    </>
  ) : busy ? (
    <div className="col-span-2 flex items-center justify-center gap-3 py-3.5 small-regular text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-line border-t-brand" />
      Решение можно принять, когда разбор будет готов
    </div>
  ) : level === 'ok' ? (
    <>
      <Button variant="ok" size="lg" onClick={() => apply('approved')}>
        <Check size={16} />
        Пациент свободен
      </Button>
      <Button size="lg" onClick={() => apply('rejected')}>
        <RefreshCw size={16} />
        Переснять
      </Button>
    </>
  ) : level === 'warn' ? (
    <>
      <Button variant="ok" size="lg" onClick={() => apply('approved')}>
        <Check size={16} />
        Принять
      </Button>
      <Button size="lg" onClick={() => apply('rejected')}>
        <RefreshCw size={16} />
        Переснять
      </Button>
    </>
  ) : (
    <>
      <Button variant="bad" size="lg" onClick={() => apply('rejected')}>
        <RefreshCw size={16} />
        Переснять
      </Button>
      <Button size="lg" onClick={() => apply('force_approved')}>
        Всё равно принять
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
        label={`Попытка ${prevIndex + 1} из ${history.length}`}
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
      <Viewer
        job={current}
        compareWith={compare && previous ? previous : undefined}
        focus={focus}
        onFocus={setFocus}
        canCompare={history.length > 0}
        compareOn={compare}
        onToggleCompare={() => {
          setCompare((value) => !value)
          setFocus('now')
        }}
        prevHead={prevHead}
      />

      {/* The panel is centred vertically against the scan viewport.
          my-auto rather than justify-center: it centres while there is spare
          height. max-h-full keeps the panel inside the screen — only the
          criteria list scrolls, while the verdict and the actions stay put.
          The station screen itself never scrolls. */}
      <div className="flex min-h-0 flex-col">
        <div className="my-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-panel bg-surface shadow-card">
          {showPrev ? (
            <div className="shrink-0 bg-brand-050 px-[22px] py-2.5 small-regular font-medium text-brand-700">
              Разбор предыдущей попытки, {timeOf(shown.created_at)}
            </div>
          ) : null}

          <div className={cn('flex shrink-0 items-center gap-4.5 border-b px-6 py-6', tone.box)}>
            <span className={cn('flex-center h-15 w-15 flex-none rounded-full border-2', tone.icon)}>
              <Icon size={32} strokeWidth={2.4} />
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

          <div className="shrink-0 border-t border-line p-4.5">
            <div className="grid grid-cols-2 gap-2.5">{actions}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostWidget
