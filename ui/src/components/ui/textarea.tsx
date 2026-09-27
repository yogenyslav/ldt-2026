import { cn } from '@/lib/utils'

const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  return (
    <textarea
      className={cn(
        'min-h-21 w-full resize-y rounded-xl border border-line-2 bg-surface px-4 py-3',
        'text-[15px] text-ink outline-none placeholder:text-muted',
        'focus:border-brand focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  )
}

export default Textarea
