import { useState } from 'react'
import { Eye, Image as ImageIcon, Layers } from 'lucide-react'
import Overlay from '@/components/shared/Overlay'
import { POINT_MARK } from '@/constants'
import { cn } from '@/lib/utils'
import { useDicomImage } from '@/hooks/useDicomImage'
import type { IJobInfo } from '@/types'

/* Окно снимка. Снимок и разметка занимают один прямоугольник и вписываются
   в него одинаково, поэтому совмещение не зависит от размеров окна. */

interface StageProps {
  job: IJobInfo
  showOverlay: boolean
}

const Stage = ({ job, showOverlay }: StageProps) => {
  const { src } = useDicomImage(job.dicom_id)

  return (
    <div className="relative min-h-0 w-full flex-1">
      {src ? (
        <img
          className="absolute inset-0 h-full w-full object-contain"
          src={src}
          alt="Снимок ДРА"
        />
      ) : null}
      {showOverlay ? <Overlay job={job} /> : null}
    </div>
  )
}

/* Ключ маркеров — легенда к снимку, как у графика. */
const MarkerKey = ({ job }: { job: IJobInfo }) => {
  const criteria = job.metadata?.criteria ?? {}
  const used: Array<{ mark: string; name: string }> = []

  for (const key of ['hip_keypoints', 'pelvis_crest']) {
    for (const pointName of Object.keys(criteria[key]?.points ?? {})) {
      const mark = POINT_MARK[pointName]
      if (mark && !used.some((item) => item.mark === mark.mark)) used.push(mark)
    }
  }

  if (!used.length) return null

  return (
    <div className="flex flex-wrap items-center gap-3.5">
      {used.map((item) => (
        <span key={item.mark} className="inline-flex items-center gap-1.5 text-[12px] text-scan-text">
          <i className="flex-center h-[18px] w-[18px] rounded-full border-[1.5px] border-mark-ok text-[10px] font-bold text-mark-ok not-italic">
            {item.mark}
          </i>
          {item.name.toLowerCase()}
        </span>
      ))}
    </div>
  )
}

const Tool = ({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-soft border px-2.5 text-[12px] font-medium transition-colors',
      active
        ? 'border-brand-400 bg-brand/25 text-scan-text-on'
        : 'border-scan-line text-scan-text hover:border-scan-edge hover:text-scan-text-on',
    )}
  >
    {children}
  </button>
)

interface ViewerProps {
  job: IJobInfo
  /* правая панель разбирает выбранный снимок */
  compareWith?: IJobInfo
  focus?: 'now' | 'prev'
  onFocus?: (target: 'now' | 'prev') => void
  canCompare?: boolean
  compareOn?: boolean
  onToggleCompare?: () => void
  prevHead?: React.ReactNode
  className?: string
}

const Viewer = ({
  job,
  compareWith,
  focus = 'now',
  onFocus,
  canCompare,
  compareOn,
  onToggleCompare,
  prevHead,
  className,
}: ViewerProps) => {
  const [showOverlay, setShowOverlay] = useState(true)
  const hasMarks = !!Object.keys(job.metadata?.criteria ?? {}).length

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-panel border border-scan-line bg-scan-bg',
        className,
      )}
    >
      {compareWith ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 items-stretch gap-2.5 p-2.5">
          <div
            onClick={() => onFocus?.('prev')}
            className={cn(
              'flex min-h-0 min-w-0 cursor-pointer flex-col gap-2 rounded-soft border-2 p-2 transition-colors',
              focus === 'prev'
                ? 'cursor-default border-brand-400 bg-brand/10'
                : 'border-scan-line hover:border-scan-edge',
            )}
          >
            <div className="flex min-h-6 items-center gap-2">{prevHead}</div>
            <Stage job={compareWith} showOverlay={showOverlay} />
          </div>

          <div
            onClick={() => onFocus?.('now')}
            className={cn(
              'flex min-h-0 min-w-0 cursor-pointer flex-col gap-2 rounded-soft border-2 p-2 transition-colors',
              focus === 'now'
                ? 'cursor-default border-brand-400 bg-brand/10'
                : 'border-scan-line hover:border-scan-edge',
            )}
          >
            <div className="flex min-h-6 items-center gap-2">
              <span
                className={cn(
                  'text-[13px] font-medium whitespace-nowrap',
                  focus === 'now' ? 'text-scan-text-on' : 'text-scan-text',
                )}
              >
                Новый снимок
              </span>
            </div>
            <Stage job={job} showOverlay={showOverlay} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-stretch justify-center p-2.5">
          {job.dicom_id ? (
            <Stage job={job} showOverlay={showOverlay} />
          ) : (
            <div className="flex-center w-full flex-col gap-2.5 text-[13px] text-scan-text">
              <ImageIcon size={22} />
              Снимок недоступен
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 border-t border-scan-line px-2.5 py-2">
        <MarkerKey job={job} />
        <span className="flex-1" />
        {canCompare && onToggleCompare ? (
          <Tool active={compareOn} onClick={onToggleCompare}>
            <Layers size={14} />
            Сравнить с предыдущим
          </Tool>
        ) : null}
        {hasMarks ? (
          <Tool active={showOverlay} onClick={() => setShowOverlay((value) => !value)}>
            <Eye size={14} />
            Разметка
          </Tool>
        ) : null}
      </div>
    </div>
  )
}

export default Viewer
