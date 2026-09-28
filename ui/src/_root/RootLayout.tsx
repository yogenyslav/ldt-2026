import { Outlet } from 'react-router-dom'
import SideNav from '@/components/widgets/SideNav'
import TopBar from '@/components/widgets/TopBar'
import { useAnnotQueue } from '@/hooks/useAnnotation'
import { useJobs } from '@/hooks/useJobs'

const RootLayout = () => {
  const { data: jobs } = useJobs()
  const { data: markup } = useAnnotQueue()
  const undecided = jobs?.filter((job) => !job.specialist_decision).length
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = jobs?.filter((job) => job.created_at.startsWith(today)).length

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        logo={<img className="h-11 w-11 object-contain" src="/assets/logo-cdt-mark.png" alt="" />}
        title="Контроль качества ДРА"
        subtitle="Центр диагностики и телемедицины"
        meta={<span>Региональный центр обработки</span>}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[258px_1fr]">
        <SideNav queueCount={undecided} markupCount={markup?.queue.length} todayCount={todayCount} />
        <main className="min-w-0 overflow-auto px-8 pt-7 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default RootLayout
