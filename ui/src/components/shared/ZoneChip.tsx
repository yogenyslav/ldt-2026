import { CircleAlert, CircleCheck, CircleHelp, Clock, TriangleAlert, X } from 'lucide-react'
import { cn, zoneLabel } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo, VerdictKind } from '@/types'

const ICON: Record<VerdictKind, React.ComponentType<{ size?: number }>> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  bad: X,
  failed: CircleAlert,
  none: CircleHelp,
  wait: Clock,
}

const TONE: Record<string, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  failed: 'bg-bad-bg text-bad',
  none: 'bg-dead-bg text-dead',
  wait: 'bg-dead-bg text-dead',
}

interface ZoneChipProps {
  job: IJobInfo
  active?: boolean
  onClick?: (event: React.MouseEvent) => void
}

const ZoneChip = ({ job, active, onClick }: ZoneChipProps) => {
  const level = verdictOf(job)
  const Icon = ICON[level]
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
      <Icon size={14} />
      {zoneLabel(job)}
    </span>
  )
}

export default ZoneChip
