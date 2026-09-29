import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { ANNOT_SOURCE, FRAME_FLAG } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotQueue, useAnnotTask, useSubmitAnnot } from '@/hooks/useAnnotation'
import { useDicomImage } from '@/hooks/useDicomImage'
import {
  activeIndex,
  clearPoint,
  confirmPoint,
  isStrokeWorthKeeping,
  nextKey,
  nextPoint,
  originOf,
  outlineOf,
  placeInQueue,
  placePoint,
  pointStates,
  toggleAbsent,
  withEdits,
  type PointEdits,
} from '@/lib/annotation'
import { caseOf } from '@/lib/annotQueue'
import { errorText } from '@/lib/errors'
import { newSubmissionId } from '@/lib/submission'
import type { ISubmission, SubmissionStatus } from '@/services/apiAnnotation'
import { SCHEMA_VERSION } from '@/services/apiAnnotation'
import type { AnnotSource, AnnotTask, IAnnotPolygon, Point } from '@/types'

const SOURCES: Array<AnnotSource | 'all'> = ['all', 'clinic', 'upload']

/* ============================================================
   Разметка снимка — a conveyor, not a form.

   One frame is open: the study the queue handed over, fetched from
   the service like any other. One point is in hand at a time; a
   click on the bone puts it there and it can be dragged. The
   keyboard carries the cycle — the digits switch point, the space
   bar says «нет на снимке», Enter sends and pulls the next one.

   What is sent is what is on the screen, in the shape the annotation
   contract asks for: the coordinates of every point in pixels of the
   original frame, how each one got there, the outlines drawn by hand
   and whatever was said about the frame.
   ============================================================ */

const AnnotDeskWidget = () => {
  const { source, setSource, tab, setTab, current, open } = useAnnot()
  const { pending, done, submissionOf, isLoading } = useAnnotQueue('all', true)
  const submit = useSubmitAnnot()
  const { toast } = useToast()
  const navigate = useNavigate()

  /* Frames put aside for now. «Пропустить» is not an answer and is not sent
     anywhere: it means «не сейчас», so the frame stays in the queue and the
     conveyor simply walks past it until the screen is left. */
  const [skipped, setSkipped] = useState<string[]>([])

  /* The desk walks exactly the queue that was chosen on the list screen — the
     same half of it and the same source. «Следующий» must not quietly hand
     over an upload to somebody who came in through «из поликлиник». */
  const chosen = tab === 'pending' ? pending : done
  const keys = useMemo(
    () =>
      chosen
        .filter((item) => source === 'all' || item.source === source)
        .map((item) => item.key),
    [chosen, source],
  )

  const correcting = tab === 'done'
  const waiting = keys.filter((item) => !skipped.includes(item))
  const key = current && keys.includes(current) ? current : (waiting[0] ?? keys[0] ?? null)

  const { data: job } = useAnnotTask(key ?? undefined)
  const { src } = useDicomImage(job?.dicom_id)

  const task = (key?.split(':')[1] ?? 'hip_keypoints') as AnnotTask
  const previous = key ? submissionOf(key) : undefined

  const [edits, setEdits] = useState<PointEdits>({})
  const [drawn, setDrawn] = useState<IAnnotPolygon[] | null>(null)
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const [drawingKind, setDrawingKind] = useState<'wire' | 'object' | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [flags, setFlags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const startedAt = useRef(Date.now())
  const sending = useRef(false)
  const pendingSubmission = useRef<{ signature: string; submission: ISubmission } | null>(null)

  const base = useMemo(() => (job && src ? caseOf(job, task, src) : null), [job, src, task])

  const work = useMemo(
    () => (base ? withEdits(base, edits, drawn ?? undefined) : null),
    [base, edits, drawn],
  )

  const total = work?.items?.length ?? 0
  const active = pick !== null && pick < total ? pick : work ? Math.max(0, activeIndex(work)) : 0

  /* A new frame on the desk starts clean — or, when a previous annotation is
     being corrected, from what was sent last time. */
  useEffect(() => {
    const points = previous?.annotations?.[task]?.points ?? []
    const restored: PointEdits = {}
    points.forEach((point, index) => {
      if (!point.present) restored[index] = { absent: true, origin: 'human' }
      else if (point.x !== null && point.y !== null) {
        restored[index] = { x: point.x, y: point.y, origin: point.origin === 'model' ? undefined : point.origin }
      }
    })

    setEdits(restored)
    setDrawn(previous?.annotations?.[task]?.polygons ?? null)
    setDrawing(null)
    setDrawingKind(null)
    setPick(null)
    setFlags(previous?.image_flags ?? [])
    setComment(previous?.comment ?? '')
    setAnswer(previous?.annotations?.[task]?.verdict ?? null)
    startedAt.current = Date.now()
  }, [key, task, previous])

  useEffect(() => {
    if (!previous && base?.verdict) setAnswer(base.verdict)
  }, [previous, base])

  const polygons = drawn ?? base?.polygons ?? []

  const place = useCallback((index: number, x: number, y: number) => {
    setPick(index)
    setEdits((current) => placePoint(current, index, x, y))
  }, [])

  const absent = useCallback(
    (index: number) => {
      setEdits((current) => {
        const next = toggleAbsent(current, index)
        if (base) setPick(nextPoint(withEdits(base, next), index))
        return next
      })
    },
    [base],
  )

  const confirm = useCallback(
    (index: number) => {
      if (!base) return
      setEdits((current) => {
        const next = confirmPoint(base, current, index)
        setPick(nextPoint(withEdits(base, next), index))
        return next
      })
    },
    [base],
  )

  const reset = useCallback((index: number) => {
    setPick(index)
    setEdits((current) => clearPoint(current, index))
  }, [])

  /* ---- the pencil ----
     Points arrive as fast as the pointer moves, so only a step of real length
     is kept: a stroke of a thousand points a tenth of a pixel apart is the
     same outline, only heavier. What survives is thinned again on release. */
  const STEP_PX = 1.2

  /* Mirrors `drawing` so strokeEnd can read the finished stroke without a
     functional setState updater: React (StrictMode in particular) is free to
     call an updater twice to check it is pure, and setDrawn used to live
     inside one — every second stroke came out doubled. */
  const strokeRef = useRef<Point[] | null>(null)

  const strokeStart = useCallback((x: number, y: number) => {
    strokeRef.current = [[x, y]]
    setDrawing(strokeRef.current)
  }, [])

  const strokeMove = useCallback((x: number, y: number) => {
    const current = strokeRef.current
    if (!current?.length) return
    const [lastX, lastY] = current[current.length - 1]
    if (Math.hypot(x - lastX, y - lastY) < STEP_PX) return
    const next = [...current, [x, y] as Point]
    strokeRef.current = next
    setDrawing(next)
  }, [])

  const strokeEnd = useCallback(() => {
    const stroke = strokeRef.current
    strokeRef.current = null
    setDrawing(null)
    /* a stray click while the pencil is armed must not leave a speck */
    if (!stroke || !drawingKind || !isStrokeWorthKeeping(stroke)) return
    const outline = outlineOf(stroke)
    setDrawn((list) => [...(list ?? base?.polygons ?? []), { cls: drawingKind, points: outline }])
  }, [drawingKind, base])

  const removePolygon = useCallback(
    (index: number) => {
      setDrawn((list) => (list ?? base?.polygons ?? []).filter((_, at) => at !== index))
    },
    [base],
  )

  /* Put aside and move on. Nothing is sent: the frame keeps its place in the
     queue and comes back on the next visit. */
  const skip = useCallback(() => {
    if (!key) return
    const rest = waiting.filter((item) => item !== key)
    setSkipped((list) => [...list, key])
    if (rest.length) open(rest[0])
  }, [key, waiting, open])

  /* ---- sending the frame on ---- */

  const finish = useCallback(
    async (status: SubmissionStatus) => {
      if (!key || !work || !job || sending.current) return

      if (status === 'uncertain' && !comment.trim()) {
        toast({
          variant: 'destructive',
          title: 'Напишите в комментарии, что именно смутило — без этого снимок не отправить',
        })
        return
      }

      const states = pointStates(work)
      const draft: Omit<ISubmission, 'submission_id' | 'created_at' | 'duration_ms'> = {
        schema_version: SCHEMA_VERSION,
        task_id: key,
        job_id: job.id,
        image: {
          rows: work.rows,
          cols: work.cols,
          region: work.region,
        },
        image_flags: flags,
        status,
        comment,
        annotations: {
          [task]:
            task === 'foreign_seg'
              ? { polygons, verdict: answer ?? 'чисто' }
              : {
                  points: (work.items ?? []).map((point, index) => {
                    const present = states[index] !== 'absent'
                    return {
                      name: point.name,
                      present,
                      x: present ? (point.prefill?.x ?? null) : null,
                      y: present ? (point.prefill?.y ?? null) : null,
                      origin: originOf(edits, index),
                    }
                  }),
                },
        },
        supersedes: previous?.submission_id ?? null,
      }

      sending.current = true
      try {
        // Повтор неизменённой разметки отправляет тот же документ, включая время и ULID.
        const signature = JSON.stringify(draft)
        if (pendingSubmission.current?.signature !== signature) {
          pendingSubmission.current = {
            signature,
            submission: {
              ...draft,
              submission_id: newSubmissionId(),
              created_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt.current,
            },
          }
        }
        const submission = pendingSubmission.current.submission
        const answered = await submit.mutateAsync(submission)
        pendingSubmission.current = null
        const warnings = answered.data?.warnings ?? []

        toast({
          title: warnings.length
            ? 'Разметка отправлена. Одна из точек лежит вне кости — проверьте, если это ошибка'
            : status === 'uncertain'
              ? 'Снимок уйдёт на второй взгляд'
              : 'Разметка отправлена',
        })

        const after = nextKey(waiting, key)
        if (after) open(after)
        else navigate('/markup')
      } catch (error) {
        toast({ variant: 'destructive', title: errorText(error, 'Не удалось отправить разметку') })
      } finally {
        sending.current = false
      }
    },
    [key, work, job, task, polygons, answer, flags, comment, edits, previous, waiting, submit, toast, open, navigate],
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

      if (event.key === 'Escape') {
        setDrawing(null)
        setDrawingKind(null)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        void finish('done')
        return
      }

      if (event.key === ' ' && total) {
        event.preventDefault()
        absent(active)
        return
      }

      const digit = Number(event.key)
      if (!digit) return

      if (work.task === 'foreign_seg') {
        const kind = digit === 1 ? 'wire' : digit === 2 ? 'object' : null
        if (kind) {
          event.preventDefault()
          setDrawingKind(kind)
          setDrawing([])
        }
        return
      }

      if (digit <= total) {
        event.preventDefault()
        setPick(digit - 1)
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [work, total, active, finish, absent])

  if (isLoading) return <Loader />

  return (
    <>
      <WorkHead
        title="Разметка снимка"
        sub={correcting ? 'правка отправленной разметки' : ANNOT_SOURCE[source]}
      />

      {/* The queue the desk is walking, changeable without going back. */}
      <div className="my-3 flex flex-wrap items-center gap-2 rounded-panel border border-line bg-surface px-3.5 py-2.5">
        <span className="mr-1 text-[13px] text-muted">Очередь</span>
        <Chip on={tab === 'pending'} count={pending.length} onClick={() => setTab('pending')}>
          ждут разметки
        </Chip>
        <Chip on={tab === 'done'} count={done.length} onClick={() => setTab('done')}>
          размеченные
        </Chip>
        <span className="mx-1 h-5 w-px bg-line" />
        {SOURCES.map((id) => (
          <Chip
            key={id}
            on={source === id}
            count={
              id === 'all' ? chosen.length : chosen.filter((item) => item.source === id).length
            }
            onClick={() => setSource(id)}
          >
            {ANNOT_SOURCE[id]}
          </Chip>
        ))}
        <span className="flex-1" />
        {skipped.length ? (
          <Button variant="quiet" className="h-8 px-3 text-[14px]" onClick={() => setSkipped([])}>
            Вернуть отложенные ({skipped.length})
          </Button>
        ) : null}
        <Button variant="quiet" className="h-8 px-3 text-[14px]" onClick={() => navigate('/markup')}>
          Открыть список
        </Button>
      </div>

      {correcting ? (
        <p className="mt-0 mb-3 text-[13.5px] text-ink-2">
          Разметка этого снимка уже отправлена — правка заменит её.
        </p>
      ) : null}

      {work && key ? (
        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4.5">
          <AnnotCanvas
            item={work}
            active={active}
            drawing={drawing}
            drawingKind={drawingKind}
            onPlace={place}
            onPickPoint={setPick}
            onStrokeStart={strokeStart}
            onStrokeMove={strokeMove}
            onStrokeEnd={strokeEnd}
            onRemovePolygon={removePolygon}
          />

          <div className="flex min-w-0 flex-col gap-4.5">
            <ActionBar
              item={work}
              place={correcting ? '' : placeInQueue(waiting, key)}
              busy={submit.isPending}
              onDone={() => void finish('done')}
              onDoubt={() => void finish('uncertain')}
              onSkip={skip}
            />

            {work.task === 'foreign_seg' ? (
              <ForeignCard
                polygons={polygons}
                kind={drawingKind}
                drawing={drawing}
                answer={answer}
                onKind={(value) => {
                  setDrawingKind(value)
                  setDrawing(value ? [] : null)
                }}
                onRemove={removePolygon}
                onAnswer={setAnswer}
              />
            ) : (
              <PointsCard
                item={work}
                active={active}
                edited={edits}
                onPick={setPick}
                onAbsent={absent}
                onConfirm={confirm}
                onReset={reset}
              />
            )}

            <NotesCard
              features={flags}
              comment={comment}
              onToggle={(flag) =>
                setFlags((list) =>
                  list.includes(flag) ? list.filter((item) => item !== flag) : [...list, flag],
                )
              }
              onComment={setComment}
              options={FRAME_FLAG}
            />
          </div>
        </div>
      ) : key ? (
        <Loader label="Снимок загружается…" />
      ) : (
        <Card>
          <Empty
            icon={<Inbox size={22} />}
            title="Размечать нечего"
            text="Анализатор уверен во всём, что через него прошло. Добавьте свои снимки в очередь заданий."
          />
        </Card>
      )}
    </>
  )
}

export default AnnotDeskWidget
