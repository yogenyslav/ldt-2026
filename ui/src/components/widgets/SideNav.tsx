import { NavLink } from 'react-router-dom'
import { BarChart3, FileText, FolderClosed, HardDrive, Layers, List, PenLine } from 'lucide-react'
import { sidebarLinks } from '@/constants'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  list: List,
  layers: Layers,
  file: FileText,
  pen: PenLine,
  chart: BarChart3,
  folder: FolderClosed,
  drive: HardDrive,
}

interface SideNavProps {
  queueCount?: number
}

const SideNav = ({ queueCount }: SideNavProps) => {
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
                  end={item.route === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-2.5 rounded-xl px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors',
                      isActive ? 'bg-brand text-white' : 'text-ink hover:bg-surface-3',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} />
                      {item.label}
                      {item.route === '/' && queueCount !== undefined ? (
                        <span
                          className={cn(
                            'ml-auto flex-center h-6 min-w-6 rounded-full px-1.5 small-regular font-semibold',
                            isActive ? 'bg-white/20 text-white' : 'bg-surface-3 text-ink-2',
                          )}
                        >
                          {queueCount}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-line px-4.5 py-3.5 text-[13px] text-muted">
        Модель <span className="tabular">dxa-qc 0.4.2</span>
        <br />
        Снимков за сутки <span className="tabular">148</span>
      </div>
    </aside>
  )
}

export default SideNav
