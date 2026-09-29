import Button from '@/components/ui/button'
import Kbd from '@/components/ui/kbd'
import Tag from '@/components/ui/tag'
import { leftToMark } from '@/lib/annotation'
import type { IAnnotCase } from '@/types'

/* ============================================================
   The conveyor lives here: a strip at the top of the panel, not
   pinned to the bottom of the screen. One action is the action —
   «Готово, следующий» — and the two ways of putting a frame aside
   sit beside it, small.
   ============================================================ */

interface ActionBarProps {
  item: IAnnotCase
  place: string
  busy?: boolean
  onDone: () => void
  onDoubt: () => void
  onSkip: () => void
}

const ActionBar = ({ item, place, busy, onDone, onDoubt, onSkip }: ActionBarProps) => {
  const left = leftToMark(item)

  return (
    <div className="flex flex-col gap-2.5 rounded-panel border-[1.5px] border-brand bg-brand-050 p-3.5">
      <div className="flex items-center gap-2.5">
        {left ? (
          <Tag tone="warn">осталось отметить: {left}</Tag>
        ) : (
          <Tag tone="ok">снимок готов</Tag>
        )}
        <span className="ml-auto text-[13.5px] text-ink-2 tabular">{place}</span>
      </div>

      <Button
        variant="primary"
        disabled={busy}
        onClick={onDone}
        className="h-11 w-full justify-center text-[15.5px]"
      >
        Готово, следующий
        <Kbd className="border-white/35 bg-transparent text-white/85">Enter</Kbd>
      </Button>

      <div className="flex gap-2">
        <Button
          variant="quiet"
          disabled={busy}
          onClick={onDoubt}
          className="h-8 px-3 text-[14px]"
        >
          сомневаюсь
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onSkip} className="h-8 px-3 text-[14px]">
          пропустить
        </Button>
      </div>
    </div>
  )
}

export default ActionBar
