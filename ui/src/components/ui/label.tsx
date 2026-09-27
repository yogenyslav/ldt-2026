import { cn } from '@/lib/utils'

const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => {
  return <label className={cn('mb-2 block small-regular font-medium text-ink-2', className)} {...props} />
}

export default Label
