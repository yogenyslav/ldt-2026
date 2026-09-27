import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import StateIcon from '@/components/shared/StateIcon'
import { criteriaRows } from '@/lib/criteria'
import { cn } from '@/lib/utils'
import type { IJobInfo } from '@/types'

/* Строка критерия живёт по тем же правилам, что выбор роли на экране входа:
   своя подложка, синий контур при наведении, синеющая стрелка.
   Пояснение раскрывается вдавленной плашкой. */

const COLUMNS = 'grid grid-cols-[40px_1fr_128px_100px_20px] items-center gap-3.5'

interface CriteriaListProps {
  job: IJobInfo
  className?: string
}

const CriteriaList = ({ job, className }: CriteriaListProps) => {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const rows = criteriaRows(job)
  if (!rows.length) return null

  return (
    <div className={cn('overflow-hidden', className)}>
      <div className={cn(COLUMNS, 'px-5 pt-4 pb-2.5 text-[13.5px] text-muted')}>
        <span />
        <span>Критерий</span>
        <span className="text-right">Значение</span>
        <span className="text-right">Норма</span>
        <span />
      </div>

      {rows.map((row) => {
        const isOpen = !!open[row.key]
        return (
          <div key={row.key}>
            <div
              onClick={() => setOpen((current) => ({ ...current, [row.key]: !current[row.key] }))}
              className={cn(
                COLUMNS,
                'group cursor-pointer border-t border-line px-5 py-3.5 transition-colors',
                'hover:bg-brand-050 hover:ring-[1.5px] hover:ring-brand-400 hover:ring-inset',
                isOpen && 'bg-brand-050',
              )}
            >
              <StateIcon level={row.level} />
              <span className="base-semibold">{row.name}</span>
              <span className="tabular text-right base-semibold whitespace-nowrap">{row.value}</span>
              <span className="tabular text-right small-regular text-muted whitespace-nowrap">
                {row.norm}
              </span>
              <ChevronRight
                size={20}
                className={cn(
                  'text-line-2 transition-transform group-hover:text-brand',
                  isOpen && 'rotate-90 text-brand',
                )}
              />
            </div>

            {isOpen && row.detail ? (
              <p className="m-0 bg-surface-3 px-[22px] py-[18px] base-regular text-ink shadow-[inset_0_2px_4px_-2px_rgba(20,22,31,0.18)]">
                {row.detail}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default CriteriaList
