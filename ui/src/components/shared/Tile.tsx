import { cn } from '@/lib/utils'

/* One number with what it is about above it and what it means below. The colour
   is the state of that number, nothing else. */

const TONE: Record<string, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  '': 'text-ink',
}

interface TileProps {
  label: string
  value: string
  note: string
  tone?: string
}

const Tile = ({ label, value, note, tone = '' }: TileProps) => {
  return (
    <div className="rounded-[11px] border border-line bg-surface px-3.5 py-3">
      <span className="block text-[13px] text-muted">{label}</span>
      <b className={cn('mt-0.5 block text-[25px] tracking-[-0.02em] tabular', TONE[tone] ?? TONE[''])}>
        {value}
      </b>
      <span className="block text-[13px] text-muted">{note}</span>
    </div>
  )
}

export default Tile
