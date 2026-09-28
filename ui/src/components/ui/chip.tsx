import { cn } from '@/lib/utils'

/* A choice among a few: the source of the queue, the parameter being tuned,
   what is odd about the frame. Pressed state follows the one highlight rule of
   the interface — a 1.5px contour plus a faint fill. */

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean
  count?: number
}

const Chip = ({ on, count, className, children, ...props }: ChipProps) => {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'inline-flex h-8.5 cursor-pointer items-center gap-2 rounded-soft border-[1.5px] px-3.5 text-[14px] transition-colors',
        on
          ? 'border-brand bg-brand-050 font-semibold text-brand-700'
          : 'border-line-2 bg-surface text-ink-2 hover:bg-hover',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? <span className="tabular">{count}</span> : null}
    </button>
  )
}

export default Chip
