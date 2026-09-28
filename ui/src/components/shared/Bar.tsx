import { cn } from '@/lib/utils'

/* How far along something is. Full is green, half-way is the accent, barely
   started is amber — the colour says whether it is worth acting on yet. */
const Bar = ({ percent }: { percent: number }) => {
  const width = Math.min(100, Math.max(0, percent))

  return (
    <div className="h-[7px] overflow-hidden rounded-[4px] bg-surface-3">
      <div
        className={cn('h-full', width >= 100 ? 'bg-ok' : width >= 50 ? 'bg-brand' : 'bg-warn')}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export default Bar
