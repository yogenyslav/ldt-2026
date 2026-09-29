import { Check as Tick } from 'lucide-react'
import { cn } from '@/lib/utils'

/* A yes-or-no answer that is part of the work, not a setting: «нет на снимке»
   beside a point, a model picked for training. Wide enough to hit with a
   pointer while reading the row it belongs to. */

interface CheckProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean
  /* the answer itself is a violation — say so in its colour */
  tone?: 'brand' | 'bad'
  /* a bare box, for a row that already carries its own label */
  bare?: boolean
}

const Check = ({ on, tone = 'brand', bare, className, children, ...props }: CheckProps) => {
  const lit = tone === 'bad' ? 'border-bad bg-bad-bg font-semibold text-bad' : 'border-brand bg-brand-050 font-semibold text-brand-700'
  const box = tone === 'bad' ? 'border-bad bg-bad text-white' : 'border-brand bg-brand text-white'

  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-soft border-[1.5px] text-[14px] transition-colors',
        bare ? 'p-[5px]' : 'py-[5px] pr-3 pl-2',
        on ? lit : 'border-line-2 bg-surface hover:bg-hover',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex-center h-4.5 w-4.5 flex-none rounded-[5px] border-[1.5px]',
          on ? box : 'border-line-2 bg-surface',
        )}
      >
        {on ? <Tick size={12} strokeWidth={3} /> : null}
      </span>
      {children}
    </button>
  )
}

export default Check
