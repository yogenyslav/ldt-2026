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
  return <div className={cn('flex items-center gap-3 px-5 pt-4 pb-3.5', className)} {...props} />
}

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('p-5', className)} {...props} />
}

/* A row, not a block: buttons and the note beside them need gaps of their own
   and a line to wrap onto when the card is narrow. */
export const CardFoot = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-line px-5 py-3.5', className)}
      {...props}
    />
  )
}

export default Card
