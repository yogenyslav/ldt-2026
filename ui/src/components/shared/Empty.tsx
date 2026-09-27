import type { ReactNode } from 'react'

interface EmptyProps {
  icon: ReactNode
  title: string
  text?: string
}

const Empty = ({ icon, title, text }: EmptyProps) => {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      <span className="flex-center h-14 w-14 rounded-full bg-surface-3 text-muted">{icon}</span>
      <span className="h2-bold text-[20px]">{title}</span>
      {text ? <p className="max-w-[540px] base-regular text-muted">{text}</p> : null}
    </div>
  )
}

export default Empty
