import { api } from '@/lib/api'
import storage from '@/lib/storage'
import type { IUserResponse, Scope } from '@/types'

interface UserLogin {
  username: string
  password: string
}

const ApiAuth = {
  /* Единственный метод, который сам разбирает ответ: кладёт токен и контур
     в storage, чтобы остальным сервисам достался готовый перехватчик. */
  async loginUser(data: UserLogin) {
    const response = await api.post<IUserResponse>('/user/login', data)
    const { token, user_id, org_id, role } = response.data

    /* Контур интерфейса. Пока бекенд не различает лаборанта поликлиники и
       врача центра, выводим его из роли — см. context/backend_requests.md, п. 4. */
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
