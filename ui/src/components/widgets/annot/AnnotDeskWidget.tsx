import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import AnnotCanvas from '@/components/shared/AnnotCanvas'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import WorkHead from '@/components/shared/WorkHead'
import ActionBar from '@/components/widgets/annot/ActionBar'
import ForeignCard from '@/components/widgets/annot/ForeignCard'
import NotesCard from '@/components/widgets/annot/NotesCard'
import PointsCard from '@/components/widgets/annot/PointsCard'
import { useToast } from '@/components/ui/toast'
import { ANNOT_CASE_TITLE, ANNOT_SOURCE } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotCase, useAnnotQueue, useSubmitAnnot } from '@/hooks/useAnnotation'
import {
  activeIndex,
  blankCase,
  nextKey,
  nextPoint,
  placeInQueue,
  queueKeys,
  toggleAnswer,
  withAnswers,
  type PointAnswers,
} from '@/lib/annotation'
import type { AnnotOutcome } from '@/services/apiAnnotation'
import type { AnnotSource, PointAnswer } from '@/types'

/* ============================================================
   Разметка снимка — a conveyor, not a form.

   One point is in hand at a time and the keyboard carries the whole
   cycle: the digits switch point, the space bar says «нет на снимке»,
   Enter sends the frame and pulls the next one.

   The queue behind it is the one chosen on the previous screen, and
   it can be changed here without going back — «следующий» always
   walks the list the doctor is actually in.
   ============================================================ */

const SOURCES: Array<AnnotSource | 'all'> = ['all', 'clinic', 'upload']

const AnnotDeskWidget = () => {
  const { source, setSource, current, open, blank, setBlank } = useAnnot()
  const { data: queue } = useAnnotQueue()
  const submit = useSubmitAnnot()
  const { toast } = useToast()
  const navigate = useNavigate()

  const keys = useMemo(() => queueKeys(queue?.queue ?? [], source), [queue, source])

  /* The frame the desk should be on: the one that was opened, as long as it is
     still in this part of the queue. */
  const key = current && keys.includes(current) ? current : (keys[0] ?? null)
  const { data: loaded } = useAnnotCase(key ?? undefined)

  /* Whether this frame came pre-annotated is a property of the frame, not of
     the desk: switching frames must not carry the previous one's answer over. */
  const queued = queue?.queue.find((item) => item.key === key)
  const isBlank = current === key && blank !== null ? blank : !queued?.pre

  const [answers, setAnswers] = useState<PointAnswers>({})
  /* The point the annotator stepped onto by hand; without one the conveyor
     picks the first that still needs attention. */
  const [pick, setPick] = useState<number | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [comment, setComment] = useState('')

  /* The frame the screen draws: the exported case plus whatever has been
     answered about it. Derived, not stored — so the first paint is already
     the right one. */
  const work = useMemo(() => {
    if (!loaded) return null
    return withAnswers(isBlank ? blankCase(loaded) : loaded, answers)
  }, [loaded, isBlank, answers])

  const total = work?.items?.length ?? 0
  const active = pick !== null && pick < total ? pick : Math.max(0, activeIndex(work ?? loaded!))

  /* A new frame on the desk starts empty: nothing answered, nothing said. */
  useEffect(() => {
    setAnswers({})
    setPick(null)
    setFeatures([])
    setComment('')
  }, [key, isBlank])

  useEffect(() => {
    setAnswer(loaded && !isBlank ? (loaded.verdict ?? null) : null)
  }, [loaded, isBlank])

  const finish = useCallback(
    async (outcome: AnnotOutcome) => {
      if (!key) return
      const after = nextKey(keys, key)
      await submit.mutateAsync({ key, outcome, features, comment })
      toast({
        title:
          outcome === 'done'
            ? 'Снимок отправлен'
            : outcome === 'doubt'
              ? 'Снимок уйдёт на второй взгляд'
              : 'Снимок пропущен',
      })
      /* When the queue runs out there is nothing to open: the frame just sent
         is gone from it, so the desk falls through to whatever is left. */
      if (after) open(after)
    },
    [key, keys, submit, features, comment, toast, open],
  )

  const answerAt = useCallback(
    (index: number, value: PointAnswer) => {
      if (!work) return
      const next = toggleAnswer(answers, index, value)
      setAnswers(next)
      setPick(nextPoint(withAnswers(work, next), index))
    },
    [work, answers],
  )

  /* The keyboard is the conveyor. It is listened to on the document, because
     the hand is on the keys and the eye is on the scan — not on a focused
     control. Typing a comment must not send the frame, so a field in focus
     takes the key back. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (!work) return

      if (event.key === 'Enter') {
        event.preventDefault()
        void finish('done')
        return
      }

      if (event.key === ' ' && total) {
        event.preventDefault()
        answerAt(active, 'absent')
        return
      }

      const digit = Number(event.key)
      if (digit >= 1 && digit <= total) {
        event.preventDefault()
        setPick(digit - 1)
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [work, total, active, finish, answerAt])

  if (!queue) return <Loader />

  return (
    <>
      <WorkHead title="Разметка снимка" sub={ANNOT_SOURCE[source]} />

      <div className="my-3 flex items-center gap-2 rounded-panel border border-line bg-surface px-3.5 py-2.5">
        <span className="mr-1 text-[13px] text-muted">Очередь</span>
        {SOURCES.map((id) => (
          <Chip
            key={id}
            on={source === id}
            count={
              id === 'all'
                ? queue.queue.length
                : queue.queue.filter((item) => item.source === id).length
            }
            onClick={() => setSource(id)}
          >
            {ANNOT_SOURCE[id]}
          </Chip>
        ))}
        <span className="flex-1" />
        <Button variant="quiet" className="h-8 px-3 text-[14px]" onClick={() => navigate('/markup')}>
          Открыть список
        </Button>
      </div>

      {work && key ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {keys.map((item) => (
              <Chip key={item} on={item === key} onClick={() => open(item)}>
                {ANNOT_CASE_TITLE[item] ?? item}
              </Chip>
            ))}
            <span className="h-0 w-full" />
            <Chip on={!isBlank} onClick={() => setBlank(false)}>
              с предварительной разметкой
            </Chip>
            <Chip on={isBlank} onClick={() => setBlank(true)}>
              без подсказок
            </Chip>
          </div>

          <div className="grid items-start gap-4.5 grid-cols-[minmax(0,1fr)_380px]">
            <AnnotCanvas item={work} active={active} />

            <div className="flex min-w-0 flex-col gap-4.5">
              <ActionBar
                item={work}
                place={placeInQueue(keys, key, queue.total[source])}
                busy={submit.isPending}
                onDone={() => void finish('done')}
                onDoubt={() => void finish('doubt')}
                onSkip={() => void finish('skip')}
              />

              {work.task === 'foreign_seg' ? (
                <ForeignCard item={work} answer={answer} onAnswer={setAnswer} />
              ) : (
                <PointsCard
                  item={work}
                  active={active}
                  onPick={setPick}
                  onAbsent={(index) => answerAt(index, 'absent')}
                  onConfirm={(index) => answerAt(index, 'confirmed')}
                />
              )}

              <NotesCard
                features={features}
                comment={comment}
                onToggle={(feature) =>
                  setFeatures((list) =>
                    list.includes(feature)
                      ? list.filter((item) => item !== feature)
                      : [...list, feature],
                  )
                }
                onComment={setComment}
              />
            </div>
          </div>
        </>
      ) : (
        <Card>
          <Empty
            icon={<Inbox size={22} />}
            title="Размечать нечего"
            text="В этой части очереди снимков не осталось. Смените источник или добавьте свои снимки в очередь заданий."
          />
        </Card>
      )}
    </>
  )
}

export default AnnotDeskWidget
