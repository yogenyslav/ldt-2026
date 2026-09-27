import { useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, RefreshCw, ScanLine, TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/button'
import CriteriaList from '@/components/shared/CriteriaList'
import Picker from '@/components/shared/Picker'
import Viewer from '@/components/shared/Viewer'
import { useToast } from '@/components/ui/toast'
import { DECISION, REGION, VERDICT_POST } from '@/constants'
import { useDecideJob, useLatestJobs } from '@/hooks/useJobs'
import { brokenNames } from '@/lib/criteria'
import { cn, timeOf } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { Decision, IJobInfo, VerdictKind } from '@/types'

/* Контур А — пост рентгенолаборанта.
   Экран один: вердикт, критерии с раскрывающимися пояснениями, кнопки.
   Снимок приходит сам, загружать ничего не нужно. */

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

const Waiting = () => (
  <div className="flex-center h-full flex-col gap-3.5 p-10 text-center text-muted">
    <ScanLine size={22} />
    <div className="text-[16px] font-medium text-ink-2">Ожидание снимка с аппарата</div>
    <div className="small-regular">
      Экран обновится сам через 2–3 секунды после сканирования.
      <br />
      Загружать ничего не нужно.
    </div>
  </div>
)

const PostWidget = () => {
  const { data: jobs, isLoading } = useLatestJobs()
  const decide = useDecideJob()
  const { toast } = useToast()

  const [compare, setCompare] = useState(false)
  const [focus, setFocus] = useState<'now' | 'prev'>('now')
  const [prevIndex, setPrevIndex] = useState(0)

  /* Текущий снимок — самый свежий, по которому ещё нет решения.
     Разобранные раньше становятся предыдущими попытками смены. */
  const { current, history } = useMemo(() => {
    const sorted = [...(jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const fresh = sorted.filter((job) => !job.specialist_decision && job.status !== 'pending')
    const done = sorted.filter((job) => job.specialist_decision)
    return { current: fresh[0] as IJobInfo | undefined, history: done }
  }, [jobs])

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

  if (!current || !shown) {
    return (
      <div className="min-h-0 flex-1 p-5">
        <div className="h-full rounded-panel border border-scan-line bg-scan-bg">
          <Waiting />
        </div>
      </div>
    )
  }

  const level = verdictOf(shown)
  const meta = VERDICT_POST[level]
  const tone = TONE[meta.tone] ?? TONE.none
  const Icon = ICON[level]

  const broken = shown.status === 'completed' ? brokenNames(shown) : []
  const subtitle =
    shown.status === 'failed'
      ? 'Снимок не удалось обработать'
      : `${shown.anatomical_region ? REGION[shown.anatomical_region] : 'Область не определена'} — ${
          broken.length ? broken.join(', ') : 'замечаний нет'
        }`

  const apply = async (decision: Decision) => {
    await decide.mutateAsync({ jobIds: [current.id], decision })
    setCompare(false)
    setFocus('now')
    setPrevIndex(0)
    toast({ title: DECISION[decision], variant: decision === 'rejected' ? 'destructive' : 'default' })
  }

  const actions = showPrev ? (
    <Button size="lg" className="col-span-2" onClick={() => setFocus('now')}>
      <ArrowRight size={16} />
      Вернуться к новому снимку
    </Button>
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

      <div className="flex min-h-0 flex-col overflow-auto">
        <div className="flex flex-col overflow-hidden rounded-panel bg-surface shadow-card">
          {showPrev ? (
            <div className="bg-brand-050 px-[22px] py-2.5 small-regular font-medium text-brand-700">
              Разбор предыдущей попытки, {timeOf(shown.created_at)}
            </div>
          ) : null}

          <div className={cn('flex items-center gap-4.5 border-b px-6 py-6', tone.box)}>
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

          {shown.status === 'failed' ? (
            <div className="p-[22px]">
              <p className="m-0 base-regular">
                Переснимите исследование. Если ошибка повторится, сообщите в центр обработки.
              </p>
              <p className="mt-2.5 mb-0 base-regular text-ink-2">{shown.error}</p>
            </div>
          ) : (
            <CriteriaList job={shown} />
          )}

          <div className="mt-auto border-t border-line p-4.5">
            <div className="grid grid-cols-2 gap-2.5">{actions}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostWidget
