import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Radio, Settings, Upload } from 'lucide-react'
import LeaveGuard from '@/components/shared/LeaveGuard'
import TopBar from '@/components/widgets/TopBar'
import CabinetProvider, { useCabinet } from '@/context/CabinetContext'
import StationProvider, { useStation } from '@/context/StationContext'
import { useLatestJobs } from '@/hooks/useJobs'
import { useOrgId } from '@/hooks/useUser'
import { isConfigured } from '@/lib/cabinet'
import { timeOf } from '@/lib/utils'

const MOS_LOGO = (
  <span
    role="img"
    aria-label="Городская поликлиника"
    className="block h-11 w-11 bg-[#5fd6dc]"
    style={{
      maskImage: 'url(/assets/logo-mos.svg)',
      WebkitMaskImage: 'url(/assets/logo-mos.svg)',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
)

const useClock = () => {
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      )
    }
    tick()
    const timer = setInterval(tick, 20_000)
    return () => clearInterval(timer)
  }, [])

  return clock
}

/* What the header says about the intake. In the device mode there is nothing
   honest to say about the link to the densitometer — the backend reports neither
   the configured modalities nor a live association — so the header shows what we
   do know: when the last scan arrived. */
const Intake = () => {
  const { cabinet } = useCabinet()
  const { data: jobs } = useLatestJobs(cabinet.intake === 'device')

  if (cabinet.intake === 'upload') {
    return (
      <span className="inline-flex items-center gap-2 small-regular font-medium text-white/80">
        <Upload size={14} />
        загрузка вручную
      </span>
    )
  }

  const last = [...(jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  return (
    <span className="inline-flex items-center gap-2 small-regular font-medium text-white/80">
      <Radio size={14} />
      приём с аппарата
      <span className="text-white/45">
        {last ? `· последний снимок ${timeOf(last.created_at)}` : '· снимков пока не было'}
      </span>
    </span>
  )
}

const PostShell = () => {
  const { cabinet } = useCabinet()
  const orgId = useOrgId()
  const clock = useClock()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onSetup = pathname.startsWith('/setup')

  /* The station does not let a visit be left open: it would come back on the
     screen at the next sign-in, and by then nobody remembers whether the
     patient was let go. Every way out asks first. */
  const station = useStation()
  const held = !onSetup && station.open
  const [leaving, setLeaving] = useState<(() => void) | null>(null)

  /* React state stores a function by calling it, hence the extra wrapper. */
  const guard = (action: () => void) => {
    if (!held) return false
    setLeaving(() => action)
    return true
  }

  /* The dialog closes first, then the interrupted action runs: otherwise it
     would linger over the screen it has just opened. */
  const finish = () => {
    const action = leaving
    setLeaving(null)
    action?.()
  }

  /* Reload and tab close go through the browser: the dialog there is the
     browser's own, all we can do is ask for it. */
  useEffect(() => {
    if (!held) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [held])

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        beforeLeave={guard}
        logo={MOS_LOGO}
        title={cabinet.clinic || `Организация № ${orgId ?? '—'}`}
        subtitle={isConfigured(cabinet) ? cabinet.room : 'Кабинет не указан — откройте настройки'}
        meta={
          cabinet.device ? (
            <>
              <span>{cabinet.device}</span>
              {cabinet.software ? (
                <>
                  <span className="text-white/25">·</span>
                  <span>{cabinet.software}</span>
                </>
              ) : null}
            </>
          ) : null
        }
        right={
          <div className="flex items-center gap-2.5">
            <Intake />
            <span className="text-white/25">·</span>
            <span className="tabular small-regular text-white/65">{clock}</span>
            <button
              type="button"
              onClick={() => {
                const open = () => navigate(onSetup ? '/post' : '/setup')
                if (!guard(open)) open()
              }}
              title={onSetup ? 'Вернуться к приёму' : 'Настройки кабинета'}
              className="flex-center h-10 w-10 cursor-pointer rounded-control text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {onSetup ? <ArrowLeft size={18} /> : <Settings size={18} />}
            </button>
          </div>
        }
      />
      <Outlet />

      <LeaveGuard open={!!leaving} onDone={finish} onCancel={() => setLeaving(null)} />
    </div>
  )
}

const PostLayout = () => (
  <CabinetProvider>
    <StationProvider>
      <PostShell />
    </StationProvider>
  </CabinetProvider>
)

export default PostLayout
