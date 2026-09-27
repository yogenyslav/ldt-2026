import { cn } from '@/lib/utils'

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-xl border border-line-2 bg-surface px-4 text-[15px] text-ink',
        'outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  )
}

export default Input
