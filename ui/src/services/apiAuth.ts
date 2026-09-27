import { api } from '@/lib/api'
import storage from '@/lib/storage'
import ApiUser from '@/services/apiUser'
import type { IUserResponse, Scope } from '@/types'

interface UserLogin {
  username: string
  password: string
}

const ApiAuth = {
  /* The only method that unpacks its own response: it stores the session so
     every other service gets a ready interceptor.

     Sign-in is two requests, because /user/login answers with the token and the
     two ids only. The role — and with it the interface contour — is read from
     /user/{id}; that call is needed anyway, the name and the role are shown in
     the header and in the settings. */
  async loginUser(data: UserLogin) {
    const response = await api.post<IUserResponse>('/user/login', data)
    const { token, user_id, org_id } = response.data

    storage.setToken(token)
    storage.setSession({ user_id, org_id })

    const user = await ApiUser.getUser(user_id)
    /* While the backend cannot tell a clinic technologist from a centre
       radiologist, the contour is derived from the role —
       context/backend_requests.md, item 4. */
    const scope: Scope = user.data.role === 'admin' ? 'center' : 'post'

    storage.setScope(scope)
    storage.setSession({ user_id, org_id, role: user.data.role, full_name: user.data.full_name })
    return scope
  },

  logout() {
    storage.clearAll()
  },
}

export default ApiAuth
