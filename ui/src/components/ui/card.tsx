import { cn } from '@/lib/utils'

const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn('flex flex-col overflow-hidden rounded-panel bg-surface shadow-card', className)}
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
