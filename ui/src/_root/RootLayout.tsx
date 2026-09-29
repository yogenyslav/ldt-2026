import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import SideNav from '@/components/widgets/SideNav'
import TopBar from '@/components/widgets/TopBar'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { useJobs } from '@/hooks/useJobs'
import { dayOf } from '@/lib/utils'

const NAV_KEY = 'nav-hidden'

/* the choice is a per-browser convenience: it must work without storage */
const readHidden = () => {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

const RootLayout = () => {
  const [hidden, setHidden] = useState(readHidden)
  const toggleNav = () => {
    setHidden(!hidden)
    try {
      localStorage.setItem(NAV_KEY, hidden ? '0' : '1')
    } catch {
      /* not saved, still works for this visit */
    }
  }
  const { pathname } = useLocation()
  const { data: jobs } = useJobs()
  const { pending: markup } = useAnnotQueue()
  const today = dayOf()
  const todayCount = jobs?.filter((job) => dayOf(job.created_at) === today).length

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        logo={<img className="h-11 w-11 object-contain" src="/assets/logo-cdt-mark.png" alt="" />}
        title="Контроль качества ДРА"
        subtitle="Центр диагностики и телемедицины"
        meta={<span>Региональный центр обработки</span>}
      />

      <div
        className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-300 ease-in-out"
        style={{ gridTemplateColumns: `${hidden ? 0 : 258}px 1fr` }}
      >
        {/* the menu keeps its width inside and is clipped by the column, so it slides
            away instead of reflowing */}
        <div className="min-w-0 overflow-hidden">
          <div className="flex h-full w-[258px] flex-col [&>aside]:flex-1">
            <SideNav markupCount={markup.length} todayCount={todayCount} />
          </div>
        </div>
        <button
          type="button"
          onClick={toggleNav}
          title={hidden ? 'Показать меню' : 'Скрыть меню'}
          style={{ left: hidden ? 8 : 258 - 8 - 40 }}
          className="fixed bottom-3 z-10 flex-center h-10 w-10 cursor-pointer rounded-control bg-surface text-muted transition-[left,color] duration-300 ease-in-out hover:text-brand"
        >
          {hidden ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        <main className="min-w-0 overflow-auto px-8 pt-7 pb-12">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default RootLayout
