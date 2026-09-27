import { Navigate, Outlet } from 'react-router-dom'
import { useUserContext } from '@/context/AuthContext'

const AuthLayout = () => {
  const { isAuth, scope } = useUserContext()

  if (isAuth) return <Navigate to={scope === 'post' ? '/post' : '/'} replace />

  return (
    <section className="grid min-h-screen grid-cols-[minmax(380px,0.9fr)_1.1fr]">
      <aside
        className="flex flex-col justify-between gap-10 px-12 py-11 text-white"
        style={{
          background:
            'radial-gradient(760px 420px at 12% 8%, rgba(46, 82, 176, 0.46) 0%, transparent 62%), var(--color-brand-900)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <img className="h-12 w-12 object-contain" src="/assets/logo-cdt-mark.png" alt="" />
          <span className="small-regular text-white/70">Центр диагностики и телемедицины</span>
        </div>

        <div>
          <h1 className="text-[44px] leading-[1.1] font-bold tracking-[-0.035em]">
            Контроль качества
            <br />
            исследований ДРА
          </h1>
          <p className="mt-4.5 max-w-[420px] text-[16px] leading-[1.55] text-white/70">
            Сервис проверяет укладку сразу после сканирования и показывает, что исправить,
            пока пациент ещё в кабинете.
          </p>
        </div>

        <div className="text-[13px] text-white/40">Доступ только для сотрудников</div>
      </aside>

      <div className="flex-center bg-surface px-6 py-11">
        <Outlet />
      </div>
    </section>
  )
}

export default AuthLayout
