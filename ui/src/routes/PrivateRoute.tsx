import { Navigate, Outlet } from 'react-router-dom'
import { useUserContext } from '@/context/AuthContext'
import type { Scope } from '@/types'

/* Контур определяется ролью при входе, а не переключателем в шапке. */
const PrivateRoute = ({ scope }: { scope: Scope }) => {
  const { isAuth, scope: current } = useUserContext()

  if (!isAuth) return <Navigate to="/sign-in" replace />
  if (current !== scope) return <Navigate to={current === 'post' ? '/post' : '/'} replace />

  return <Outlet />
}

export default PrivateRoute
