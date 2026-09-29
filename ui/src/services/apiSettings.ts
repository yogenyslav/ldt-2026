import { api } from '@/lib/api'
import type { IRotationSettings } from '@/lib/settings'

const ApiSettings = {
  async get() {
    return await api.get<IRotationSettings>('/settings')
  },
  async save(settings: IRotationSettings) {
    return await api.put<IRotationSettings>('/settings', settings)
  },
}

export default ApiSettings
