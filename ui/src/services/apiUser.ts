import { api } from '@/lib/api'
import type { IUserInfo } from '@/types'

const ApiUser = {
  async getUser(userId: number) {
    return await api.get<IUserInfo>(`/user/${userId}`)
  },
}

export default ApiUser
