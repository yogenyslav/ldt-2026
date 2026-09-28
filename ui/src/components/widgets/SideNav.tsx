import { NavLink } from 'react-router-dom'
import {
  BrainCircuit,
  FileText,
  HardDrive,
  Inbox,
  Layers,
  List,
  PenLine,
  SlidersHorizontal,
} from 'lucide-react'
import { sidebarLinks } from '@/constants'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  list: List,
  layers: Layers,
  file: FileText,
  pen: PenLine,
  inbox: Inbox,
  brain: BrainCircuit,
  sliders: SlidersHorizontal,
  drive: HardDrive,
}

interface SideNavProps {
  queueCount?: number
  markupCount?: number
  todayCount?: number
}

/* Which links carry a count, and where it comes from. */
const COUNTED: Record<string, 'queue' | 'markup'> = {
  '/': 'queue',
  '/markup': 'markup',
}

const SideNav = ({ queueCount, markupCount, todayCount }: SideNavProps) => {
  return (
    <aside className="flex flex-col border-r border-line bg-surface">
      <nav className="flex flex-col gap-0.5 p-3">
        {sidebarLinks.map((group) => (
          <div key={group.group}>
            <div className="px-3.5 pt-4.5 pb-2 text-[13px] text-muted">{group.group}</div>
            {group.items.map((item) => {
              const Icon = ICONS[item.icon]
              return (
                <NavLink
                  key={item.route}
                  to={item.route}
                  /* every link is matched whole: «Очередь заданий» is /markup
                     and «Разметка снимка» is /markup/frame, so a prefix match
                     would light both at once */
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-2.5 rounded-control px-3.5 text-[15px] font-medium whitespace-nowrap transition duration-150 ease-out active:scale-[0.97]',
                      isActive ? 'bg-brand text-white' : 'text-ink hover:bg-hover',
                    )
                  }
                >
                  {({ isActive }) => {
                    const count =
                      COUNTED[item.route] === 'queue'
                        ? queueCount
                        : COUNTED[item.route] === 'markup'
                          ? markupCount
                          : undefined

                    return (
                    <>
                      <Icon size={18} />
                      {item.label}
                      {count !== undefined ? (
                        <span
                          className={cn(
                            'ml-auto flex-center h-6 min-w-6 rounded-full px-1.5 small-regular font-semibold',
                            isActive ? 'bg-white/20 text-white' : 'bg-surface-3 text-ink-2',
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </>
                    )
                  }}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Counted over the loaded page: the backend has no aggregates yet —
          context/backend_requests.md */}
      <div className="mt-auto border-t border-line px-4.5 py-3.5 text-[13px] text-muted">
        Снимков за сутки <span className="tabular">{todayCount ?? '—'}</span>
      </div>
    </aside>
  )
}

export default SideNav
