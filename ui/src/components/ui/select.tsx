import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/* A native <select> opens its option list in the browser's own chrome, which
   ignores our rounded corners and shadows no matter what we put on the
   element itself. This draws the whole thing ourselves, styled like every
   other panel in the app. */

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
  className?: string
}

const Select = ({ id, value, onChange, options, className }: SelectProps) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = options.find(([key]) => key === value)?.[1] ?? options[0]?.[1]

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

  return (
    <div className="relative" ref={box}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-control border-[1.5px] border-line-2 bg-surface px-4 text-left text-[14.5px] text-ink transition-colors hover:border-brand-400 hover:bg-hover',
          open && 'border-brand bg-brand-050',
          className,
        )}
      >
        <span className="flex-1 truncate">{current}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180 text-brand')}
        />
      </button>

      {open ? (
        <div className="menu-pop absolute top-[calc(100%+6px)] left-0 z-20 max-h-72 min-w-full overflow-auto rounded-panel border border-line bg-surface p-1.5 shadow-menu">
          {options.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setOpen(false)
                onChange(key)
              }}
              className={cn(
                'hl-row flex w-full cursor-pointer items-center rounded-soft px-3 py-2.5 text-left text-[14.5px] whitespace-nowrap',
                key === value && 'is-on',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default Select
