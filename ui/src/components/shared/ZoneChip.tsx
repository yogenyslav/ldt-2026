import { REGION_SHORT, STATUS } from '@/constants'
import { cn } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

const TONE: Record<string, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  failed: 'bg-bad-bg text-bad',
  none: 'bg-dead-bg text-dead',
  wait: 'bg-dead-bg text-dead',
}

/* Пока снимок не обработан, вместо области показываем состояние. */
export const zoneLabel = (job: IJobInfo) =>
  job.anatomical_region ? REGION_SHORT[job.anatomical_region] : STATUS[job.status]

interface ZoneChipProps {
  job: IJobInfo
  active?: boolean
  onClick?: (event: React.MouseEvent) => void
}

const ZoneChip = ({ job, active, onClick }: ZoneChipProps) => {
  const level = verdictOf(job)
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium whitespace-nowrap',
        TONE[level],
        active && 'ring-[1.5px] ring-current ring-inset',
        onClick && 'cursor-pointer',
      )}
    >
      {zoneLabel(job)}
    </span>
  )
}

export default ZoneChip
