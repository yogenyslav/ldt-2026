import { LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUserContext } from '@/context/AuthContext'
import { useCurrentUser } from '@/hooks/useUser'
import ApiAuth from '@/services/apiAuth'

/* Dark header with a glow — the same visual language as the sign-in screen. */
const BACKGROUND =
  'radial-gradient(680px 340px at 6% 0%, rgba(46, 82, 176, 0.5) 0%, transparent 62%), var(--color-brand-900)'

interface TopBarProps {
  logo: React.ReactNode
  title: string
  subtitle: string
  meta?: React.ReactNode
  right?: React.ReactNode
  /* A screen may hold the specialist back — the station does not let a scan
     without a decision be left behind. Returns true when it took the action
     over and the header should do nothing. */
  beforeLeave?: (action: () => void) => boolean
}

const TopBar = ({ logo, title, subtitle, meta, right, beforeLeave }: TopBarProps) => {
  const { setIsAuth } = useUserContext()
  const { data: user } = useCurrentUser()
  const navigate = useNavigate()

  const logout = () => {
    const leave = () => {
      ApiAuth.logout()
      setIsAuth(false)
      navigate('/sign-in')
    }
    if (beforeLeave?.(leave)) return
    leave()
  }

  return (
    <header
      className="flex h-[68px] flex-none items-center gap-4 px-[26px] text-white"
      style={{ background: BACKGROUND }}
    >
      <div className="flex items-center gap-3.5 border-r border-white/15 pr-5">
        {logo}
        <div>
          <div className="small-regular font-semibold">{title}</div>
          <div className="text-[12.5px] text-white/60">{subtitle}</div>
        </div>
      </div>

      {meta ? <div className="flex items-center gap-2.5 small-regular text-white/65">{meta}</div> : null}

      <span className="flex-1" />
      {right}

      <div className="flex items-center gap-2.5 border-l border-white/15 pl-4.5">
        <User size={18} className="text-white/60" />
        <div>
          <div className="small-regular font-medium">{user?.full_name ?? '—'}</div>
          <div className="text-[12px] text-white/60">
            {user?.role === 'admin' ? 'врач-рентгенолог · ЦДиТ' : 'рентгенолаборант'}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          title="Выйти"
          className="flex-center h-10 w-10 cursor-pointer rounded-control text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}

export default TopBar
