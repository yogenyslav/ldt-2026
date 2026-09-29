import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/* The same drawn menu as Select, with a check mark per option: any number of
   them can be on at once. `summary` says what the closed button shows. */

interface MultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  options: Array<[string, string]>
  summary: (labels: string[]) => string
  className?: string
}

const MultiSelect = ({ value, onChange, options, summary, className }: MultiSelectProps) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])

  const labels = options.filter(([key]) => value.includes(key)).map(([, label]) => label)

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-control border-[1.5px] border-line-2 bg-surface px-4 text-left text-[14.5px] text-ink transition-colors hover:border-brand-400 hover:bg-hover',
          open && 'border-brand bg-brand-050',
          className,
        )}
      >
        <span className="flex-1 truncate">{summary(labels)}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180 text-brand')}
        />
      </button>

      {open ? (
        <div className="menu-pop absolute top-[calc(100%+6px)] left-0 z-20 max-h-72 min-w-full overflow-auto rounded-panel border border-line bg-surface p-1.5 shadow-menu">
          {options.map(([key, label]) => {
            const on = value.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                className="hl-row flex w-full cursor-pointer items-center gap-2.5 rounded-soft px-3 py-2.5 text-left text-[14.5px] whitespace-nowrap"
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
                    on ? 'border-brand bg-brand text-white' : 'border-line-2',
                  )}
                >
                  {on ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default MultiSelect
