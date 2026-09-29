import { Outlet, useLocation } from 'react-router-dom'
import SideNav from '@/components/widgets/SideNav'
import TopBar from '@/components/widgets/TopBar'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { useJobs } from '@/hooks/useJobs'
import { dayOf } from '@/lib/utils'

const RootLayout = () => {
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

      <div className="grid min-h-0 flex-1 grid-cols-[258px_1fr]">
        <SideNav markupCount={markup.length} todayCount={todayCount} />
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
