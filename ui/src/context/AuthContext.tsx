import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import storage from '@/lib/storage'
import type { IAuthContext, Scope } from '@/types'

const AuthContext = createContext<IAuthContext | undefined>(undefined)

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuth, setIsAuth] = useState(!!storage.getToken())
  const [scope, setScope] = useState<Scope>(storage.getScope() ?? 'center')

  return (
    <AuthContext.Provider value={{ isAuth, setIsAuth, scope, setScope }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider

export const useUserContext = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useUserContext должен вызываться внутри AuthProvider')
  return context
}
