import { cn } from '@/lib/utils'

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-control border-[1.5px] border-line-2 bg-surface px-4 text-[15px] text-ink',
        'outline-none placeholder:text-muted focus:border-brand focus:bg-brand-050',
        className,
      )}
      {...props}
    />
  )
}

export default Input
