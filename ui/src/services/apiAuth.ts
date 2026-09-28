import { api } from '@/lib/api'
import storage from '@/lib/storage'
import ApiUser from '@/services/apiUser'
import type { IUserResponse, Scope } from '@/types'

interface UserLogin {
  email: string
  password: string
}

const ApiAuth = {
  async loginUser(data: UserLogin) {
    storage.clearAll()
    try {
      const response = await api.post<IUserResponse>('/user/login', data)
      const { token, user_id, organization_id, role } = response.data
      storage.setToken(token)
      const user = await ApiUser.getUser(user_id)
      const scope: Scope = role === 'admin' ? 'center' : 'post'
      storage.setScope(scope)
      storage.setSession({ user_id, organization_id, role, full_name: user.data.full_name })
      return scope
    } catch (error) {
      storage.clearAll()
      throw error
    }
  },

  logout() {
    storage.clearAll()
  },
}

export default ApiAuth
