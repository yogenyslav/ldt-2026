import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /* A corner mark names a card that carries the work of the screen; calmer
     cards below it go without one. */
  mark?: boolean
}

const Card = ({ className, mark, ...props }: CardProps) => {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-panel border border-line bg-surface',
        mark && 'mark-top',
        className,
      )}
      {...props}
    />
  )
}

export const CardHead = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('flex items-center gap-3 px-[22px] pt-[18px] pb-[14px]', className)} {...props} />
}

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('p-[22px]', className)} {...props} />
}

export const CardFoot = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('border-t border-line px-[22px] py-4', className)} {...props} />
}

export default Card
