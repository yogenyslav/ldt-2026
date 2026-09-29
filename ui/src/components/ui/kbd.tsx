import { cn } from '@/lib/utils'

/* A key, printed next to the action it performs. The desk is a conveyor: the
   keyboard carries the whole cycle, so every key is named on the screen. */
const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return (
    <kbd
      className={cn(
        'ml-0.5 inline-block rounded-[5px] border border-b-2 border-line-2 bg-surface px-1.5',
        'align-[1px] text-[11.5px] font-medium text-ink-2 not-italic',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export default Kbd
