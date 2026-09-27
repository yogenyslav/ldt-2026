import { Navigate, Outlet } from 'react-router-dom'
import { useUserContext } from '@/context/AuthContext'
import type { Scope } from '@/types'

/* The scope comes from the role at sign-in, not from a toggle in the header. */
const PrivateRoute = ({ scope }: { scope: Scope }) => {
  const { isAuth, scope: current } = useUserContext()

  if (!isAuth) return <Navigate to="/sign-in" replace />
  if (current !== scope) return <Navigate to={current === 'post' ? '/post' : '/'} replace />

  return <Outlet />
}

export default PrivateRoute
