import { cn } from '@/lib/utils'

/* One readable note per card, in the ordinary size, on a light plate — instead
   of a scatter of grey micro-captions. */
const Hint = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return (
    <p
      className={cn(
        'mt-3.5 mb-0 rounded-soft bg-surface-2 px-3.5 py-3 text-[13.5px] leading-normal text-ink-2',
        className,
      )}
    >
      {children}
    </p>
  )
}

export default Hint
