import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface IStep {
  title: string
  note: string
}

interface StepsProps {
  steps: IStep[]
  now: number
}

/* Study progress track: uploaded — processed — reviewed — included in report. */
const Steps = ({ steps, now }: StepsProps) => {
  const fill = (100 * now) / (steps.length - 1)

  return (
    <div className="mb-6 pt-1">
      <div className="relative mb-3.5 flex items-center">
        <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line" />
        <span
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-brand transition-[width]"
          style={{ width: `${fill}%` }}
        />
        <div className="relative flex w-full justify-between">
          {steps.map((step, index) => (
            <span
              key={step.title}
              className={cn(
                'flex-center h-[18px] w-[18px] rounded-full border-2 bg-surface',
                index < now && 'border-brand text-brand',
                index === now && 'border-brand bg-brand shadow-[0_0_0_4px_var(--color-brand-100)]',
                index > now && 'border-line-2',
              )}
            >
              {index < now ? <Check size={10} strokeWidth={3} /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="grid auto-cols-fr grid-flow-col">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className={cn(
              'px-1.5 text-center text-[13px] text-muted',
              index === 0 && 'pl-0 text-left',
              index === steps.length - 1 && 'pr-0 text-right',
            )}
          >
            <b className={cn('block small-regular font-semibold text-ink', index === now && 'text-brand-700')}>
              {step.title}
            </b>
            <span className="tabular text-[13px]">{step.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Steps
