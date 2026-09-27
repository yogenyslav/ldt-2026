import { cn } from '@/lib/utils'
import type { VerdictKind } from '@/types'

const TONE: Record<string, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  failed: 'bg-bad-bg text-bad',
  none: 'bg-dead-bg text-dead',
  wait: 'bg-dead-bg text-dead',
  '': 'bg-dead-bg text-dead',
}

const SYMBOL: Record<string, string> = {
  ok: '✓',
  warn: '!',
  bad: '✕',
  failed: '!',
  none: '–',
  wait: '·',
  '': '–',
}

interface StateIconProps {
  level: VerdictKind | ''
  size?: 'sm' | 'md'
  className?: string
}

const StateIcon = ({ level, size = 'md', className }: StateIconProps) => {
  return (
    <span
      className={cn(
        'flex-center flex-none rounded-soft font-bold',
        size === 'sm' ? 'h-7 w-7 text-[13px]' : 'h-10 w-10 rounded-xl text-[16px]',
        TONE[level] ?? TONE[''],
        className,
      )}
    >
      {SYMBOL[level] ?? SYMBOL['']}
    </span>
  )
}

export default StateIcon
