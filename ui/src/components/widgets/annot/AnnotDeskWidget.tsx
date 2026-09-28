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
import { ANNOT_SOURCE } from '@/constants'
import { useAnnot } from '@/context/AnnotContext'
import { useAnnotCase, useAnnotQueue, useSubmitAnnot } from '@/hooks/useAnnotation'
import {
  activeIndex,
  canClose,
  clearPoint,
  confirmPoint,
  nextKey,
  nextPoint,
  placeInQueue,
  placePoint,
  pointStates,
  queueKeys,
  toggleAbsent,
  withEdits,
  type PointEdits,
} from '@/lib/annotation'
import type { AnnotOutcome } from '@/services/apiAnnotation'
import type { AnnotSource, IAnnotPolygon, Point } from '@/types'

/* ============================================================
   Разметка снимка — a conveyor, not a form.

   One frame is open: the one the queue handed over. One point is in
   hand at a time; a click on the bone puts it there and it can be
   dragged. The keyboard carries the cycle — the digits switch point,
   the space bar says «нет на снимке», Enter sends the frame and
   pulls the next one out of the same queue.

   What is sent is what is on the screen: the coordinates of every
   point in the pixels of the original frame, the outlines drawn by
   hand, and whatever was said about the frame.
   ============================================================ */

const SOURCES: Array<AnnotSource | 'all'> = ['all', 'clinic', 'upload']

const AnnotDeskWidget = () => {
  const { source, setSource, current, open } = useAnnot()
  const { data: queue } = useAnnotQueue()
  const submit = useSubmitAnnot()
  const { toast } = useToast()
  const navigate = useNavigate()

  const keys = useMemo(() => queueKeys(queue?.queue ?? [], source), [queue, source])
  const key = current && keys.includes(current) ? current : (keys[0] ?? null)
  const { data: loaded } = useAnnotCase(key ?? undefined)

  const [edits, setEdits] = useState<PointEdits>({})
  const [drawn, setDrawn] = useState<IAnnotPolygon[] | null>(null)
  const [drawing, setDrawing] = useState<Point[] | null>(null)
  const [drawingKind, setDrawingKind] = useState<'wire' | 'object' | null>(null)
  /* The point the annotator stepped onto by hand; without one the conveyor
     picks the first that still needs attention. */
  const [pick, setPick] = useState<number | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [comment, setComment] = useState('')

  /* The frame as it stands: what the model suggested, with the annotator's
     work on top. Derived, so the first paint is already the right one. */
  const work = useMemo(
    () => (loaded ? withEdits(loaded, edits, drawn ?? undefined) : null),
    [loaded, edits, drawn],
  )

  const total = work?.items?.length ?? 0
  const active = pick !== null && pick < total ? pick : work ? Math.max(0, activeIndex(work)) : 0

  /* A new frame on the desk starts clean. */
  useEffect(() => {
    setEdits({})
    setDrawn(null)
    setDrawing(null)
    setDrawingKind(null)
    setPick(null)
    setFeatures([])
    setComment('')
  }, [key])

  useEffect(() => setAnswer(loaded?.verdict ?? null), [loaded])

  const polygons = drawn ?? loaded?.polygons ?? []

  const place = useCallback((index: number, x: number, y: number) => {
    setPick(index)
    setEdits((current) => placePoint(current, index, x, y))
  }, [])

  const absent = useCallback(
    (index: number) => {
      setEdits((current) => {
        const next = toggleAbsent(current, index)
        if (loaded) setPick(nextPoint(withEdits(loaded, next), index))
        return next
      })
    },
    [loaded],
  )

  const confirm = useCallback(
    (index: number) => {
      if (!loaded) return
      setEdits((current) => {
        const next = confirmPoint(loaded, current, index)
        setPick(nextPoint(withEdits(loaded, next), index))
        return next
      })
    },
    [loaded],
  )

  const reset = useCallback((index: number) => {
    setPick(index)
    setEdits((current) => clearPoint(current, index))
  }, [])

  /* ---- drawing an outline ---- */

  const addVertex = useCallback((x: number, y: number) => {
    setDrawing((current) => [...(current ?? []), [x, y] as Point])
  }, [])

  const closeOutline = useCallback(() => {
    if (!drawing || !canClose(drawing) || !drawingKind) return
    setDrawn((list) => [
      ...(list ?? loaded?.polygons ?? []),
      { cls: drawingKind, points: drawing },
    ])
    setDrawing([])
  }, [drawing, drawingKind, loaded])

  const dropVertex = useCallback(() => {
    setDrawing((current) => (current?.length ? current.slice(0, -1) : current))
  }, [])

  const removePolygon = useCallback(
    (index: number) => {
      setDrawn((list) => (list ?? loaded?.polygons ?? []).filter((_, at) => at !== index))
    },
    [loaded],
  )

  /* ---- sending the frame on ---- */

  const finish = useCallback(
    async (outcome: AnnotOutcome) => {
      if (!key || !work) return
      const after = nextKey(keys, key)
      const states = pointStates(work)

      await submit.mutateAsync({
        key,
        outcome,
        points: (work.items ?? []).map((point, index) => ({
          name: point.name,
          present: states[index] !== 'absent',
          x: point.prefill?.x ?? null,
          y: point.prefill?.y ?? null,
        })),
        polygons: work.task === 'foreign_seg' ? polygons : undefined,
        verdict: work.task === 'foreign_seg' ? (answer ?? undefined) : undefined,
        features,
        comment,
      })

      toast({
        title:
          outcome === 'done'
            ? 'Разметка отправлена'
            : outcome === 'doubt'
              ? 'Снимок уйдёт на второй взгляд'
              : 'Снимок пропущен',
      })
      if (after) open(after)
    },
    [key, work, keys, polygons, answer, features, comment, submit, toast, open],
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

      if (work.task === 'foreign_seg') {
        if (event.key === 'Backspace' && drawing?.length) {
          event.preventDefault()
          dropVertex()
          return
        }
        if (event.key === 'Enter' && drawing && canClose(drawing)) {
          event.preventDefault()
          closeOutline()
          return
        }
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
  }, [work, total, active, drawing, finish, absent, dropVertex, closeOutline])

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
        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4.5">
          <AnnotCanvas
            item={work}
            active={active}
            drawing={drawing}
            drawingKind={drawingKind}
            onPlace={place}
            onPickPoint={setPick}
            onVertex={addVertex}
            onCloseOutline={closeOutline}
            onRemovePolygon={removePolygon}
          />

          <div className="flex min-w-0 flex-col gap-4.5">
            <ActionBar
              item={work}
              place={placeInQueue(keys, key)}
              busy={submit.isPending}
              onDone={() => void finish('done')}
              onDoubt={() => void finish('doubt')}
              onSkip={() => void finish('skip')}
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
                onClose={closeOutline}
                onDropVertex={dropVertex}
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
      ) : key ? (
        /* the frame is on its way — the queue says there is one */
        <Loader label="Снимок загружается…" />
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
