import { api } from '@/lib/api'
import storage from '@/lib/storage'
import type { IUserResponse, Scope } from '@/types'

interface UserLogin {
  username: string
  password: string
}

const ApiAuth = {
  /* The only method that unpacks its own response: it stores the token and
     the scope so every other service gets a ready interceptor. */
  async loginUser(data: UserLogin) {
    const response = await api.post<IUserResponse>('/user/login', data)
    const { token, user_id, org_id, role } = response.data

    /* UI scope. While the backend cannot tell a clinic technologist from a
       centre radiologist, derive it from the role — context/backend_requests.md, item 4. */
    const scope: Scope = response.data.scope ?? (role === 'admin' ? 'center' : 'post')

    storage.setToken(token)
    storage.setScope(scope)
    storage.setUser({ user_id, org_id, role })
    return scope
  },

  logout() {
    storage.clearAll()
  },
}

export default ApiAuth
