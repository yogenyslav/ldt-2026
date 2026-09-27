import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import StateIcon from '@/components/shared/StateIcon'
import { VERDICT_LIST } from '@/constants'
import { cn, timeOf, zoneLabel } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

/* A study may hold any number of scans and any number of retakes,
   so this is a dropdown rather than a row of buttons. */

interface PickerProps {
  current: IJobInfo
  items: IJobInfo[]
  onPick: (job: IJobInfo) => void
  label?: string
  count?: string
  dark?: boolean
}

const Picker = ({ current, items, onPick, label, count, dark }: PickerProps) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={cn(
          'flex cursor-pointer items-center gap-2.5 rounded-control border transition-colors',
          dark
            ? 'h-9 min-w-[190px] flex-1 border-scan-edge bg-white/5 px-3 text-[13.5px] text-scan-text-on hover:border-brand-400 hover:bg-brand/25'
            : 'h-12 min-w-[260px] border-[1.5px] border-line-2 bg-surface px-3.5 text-[15px] text-ink hover:border-brand-400 hover:bg-hover',
          open && (dark ? 'border-brand-400 bg-brand/25' : 'border-brand bg-brand-050'),
        )}
      >
        <StateIcon level={verdictOf(current)} size="sm" className={dark ? 'h-[22px] w-[22px]' : ''} />
        <span className="flex-1 text-left font-semibold whitespace-nowrap">
          {label ?? zoneLabel(current)}
        </span>
        {count ? (
          <span className={cn('whitespace-nowrap', dark ? 'text-[12.5px] text-scan-text' : 'small-regular text-muted')}>
            {count}
          </span>
        ) : null}
        <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180 text-brand')} />
      </button>

      {open ? (
        <div className="absolute top-[calc(100%+6px)] left-0 z-20 max-h-80 min-w-full overflow-auto rounded-panel border border-line bg-surface p-1.5 shadow-menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                onPick(item)
              }}
              className={cn(
                'hl-row flex w-full cursor-pointer items-center gap-2.5 rounded-soft px-2.5 py-2.5 text-left',
                item.id === current.id && 'is-on',
              )}
            >
              <StateIcon level={verdictOf(item)} size="sm" />
              <span className="base-semibold whitespace-nowrap">
                {zoneLabel(item)}
                <span className="block small-regular font-normal text-muted">
                  {timeOf(item.created_at)}, {VERDICT_LIST[verdictOf(item)].title.toLowerCase()}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default Picker
