import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control base-semibold ' +
    'cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border border-line-2 bg-surface text-ink hover:bg-surface-3 hover:border-muted',
        primary: 'border border-brand bg-brand text-white hover:bg-brand-700 hover:border-brand-700',
        ok: 'border border-ok bg-ok text-white hover:brightness-90',
        bad: 'border border-bad bg-bad text-white hover:brightness-90',
        quiet: 'border border-transparent bg-transparent text-ink-2 hover:bg-surface-3',
      },
      size: {
        default: 'h-10 px-[18px]',
        lg: 'h-[52px] px-[26px] text-[16px]',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = ({ className, variant, size, ...props }: ButtonProps) => {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export default Button
