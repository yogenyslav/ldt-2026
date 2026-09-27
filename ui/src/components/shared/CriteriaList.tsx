import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import StateIcon from '@/components/shared/StateIcon'
import { criteriaRows } from '@/lib/criteria'
import { cn } from '@/lib/utils'
import type { IJobInfo, VerdictKind } from '@/types'

/* A criterion row and its explanation are one rounded block, coloured by the
   state of the criterion: hovering tints it in its own colour and expanding
   deepens the same colour, so nothing recolours under the hand.
   The rules live in globals.css — see .crit-item. */

const COLUMNS = 'grid grid-cols-[30px_1fr_124px_88px_18px] items-center gap-3.5'

const STATE: Record<VerdictKind | '', string> = {
  ok: 'crit-ok',
  warn: 'crit-warn',
  bad: 'crit-bad',
  failed: 'crit-bad',
  none: 'crit-dead',
  wait: 'crit-dead',
  '': 'crit-dead',
}

interface CriteriaListProps {
  job: IJobInfo
  className?: string
}

const CriteriaList = ({ job, className }: CriteriaListProps) => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const rows = criteriaRows(job)
  if (!rows.length) return null

  return (
    <div className={cn('px-3 pb-2.5', className)}>
      <div className={cn(COLUMNS, 'px-3 pt-3.5 pb-2 text-[13.5px] text-muted')}>
        <span />
        <span>Критерий</span>
        <span className="text-right">Значение</span>
        <span className="text-right">Норма</span>
        <span />
      </div>

      {rows.map((row) => {
        const isOpen = !!open[row.key]
        return (
          <div
            key={row.key}
            className={cn('crit-item mt-[3px] first:mt-0', STATE[row.level], isOpen && 'is-open')}
          >
            <div
              onClick={() => setOpen((current) => ({ ...current, [row.key]: !current[row.key] }))}
              className={cn(COLUMNS, 'crit-row group cursor-pointer px-3 py-2.5')}
            >
              <StateIcon level={row.level} />
              <span className="base-semibold">{row.name}</span>
              <span className="tabular text-right base-semibold whitespace-nowrap">{row.value}</span>
              <span className="tabular text-right small-regular text-muted whitespace-nowrap">
                {row.norm}
              </span>
              <ChevronRight
                size={18}
                className={cn(
                  'text-line-2 transition-transform group-hover:text-[var(--state)]',
                  isOpen && 'rotate-90 text-[var(--state)]',
                )}
              />
            </div>

            {/* the height is not known up front, so animate grid-template-rows:
                0fr -> 1fr expands any amount of text smoothly */}
            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <p className="m-0 px-3 pt-0.5 pb-3.5 pl-[57px] base-regular text-ink">{row.detail}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default CriteriaList
