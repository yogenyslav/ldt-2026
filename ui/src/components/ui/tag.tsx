import { cn } from '@/lib/utils'

/* A word about a state, in the colour of that state. Not a control: nothing
   here is clickable, so it is a span everywhere. */

const TONE: Record<string, string> = {
  ok: 'border-ok-line bg-ok-bg text-ok',
  warn: 'border-warn-line bg-warn-bg text-warn',
  bad: 'border-bad-line bg-bad-bg text-bad',
  dead: 'border-dead-line bg-dead-bg text-dead',
  '': 'border-line-2 bg-surface-2 text-ink-2',
}

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: string
}

const Tag = ({ tone = '', className, ...props }: TagProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] whitespace-nowrap',
        TONE[tone] ?? TONE[''],
        className,
      )}
      {...props}
    />
  )
}

export default Tag
