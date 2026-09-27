import { VERDICT_LIST } from '@/constants'
import { cn } from '@/lib/utils'
import type { VerdictKind } from '@/types'

const TONE: Record<string, string> = {
  ok: 'border-ok-line bg-ok-bg text-ok',
  warn: 'border-warn-line bg-warn-bg text-warn',
  bad: 'border-bad-line bg-bad-bg text-bad',
  failed: 'border-bad-line bg-bad-bg text-bad',
  none: 'border-dead-line bg-dead-bg text-dead',
  wait: 'border-dead-line bg-dead-bg text-dead',
}

interface VerdictBadgeProps {
  level: VerdictKind
  className?: string
}

const VerdictBadge = ({ level, className }: VerdictBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-semibold whitespace-nowrap',
        TONE[level],
        className,
      )}
    >
      {VERDICT_LIST[level].title}
    </span>
  )
}

export default VerdictBadge
